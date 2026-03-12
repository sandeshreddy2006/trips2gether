'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

type LivenessAction = 'nod' | 'open_mouth';

interface FaceVerificationSetupProps {
    onSuccess?: () => void;
    onCancel?: () => void;
}

interface FaceDetectionWithDescriptor {
    detection: {
        box: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    descriptor: Float32Array;
    landmarks: {
        getMouth: () => faceapi.Point[];
        getNose: () => faceapi.Point[];
        getLeftEye: () => faceapi.Point[];
        getRightEye: () => faceapi.Point[];
    };
}

interface FaceAlignmentResult {
    ok: boolean;
    message: string;
}

const SETUP_CAPTURE_WINDOW_MS = 5000;
const SETUP_MIN_CAPTURED_FRAMES = 30;
const SETUP_MAX_CAPTURED_FRAMES = 180;
const MOUTH_OPEN_THRESHOLD = 0.3;
const MOUTH_OPEN_REQUIRED_FRAMES = 3;
const NOD_RANGE_THRESHOLD = 0.08;

const randomLivenessAction = (): LivenessAction => (
    Math.random() < 0.5 ? 'nod' : 'open_mouth'
);

const getLivenessInstruction = (action: LivenessAction): string => (
    action === 'nod'
        ? 'Liveness check: nod your head slowly.'
        : 'Liveness check: open your mouth for a moment.'
);

const distance = (a: faceapi.Point, b: faceapi.Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const averageDescriptors = (descriptors: number[][]): number[] => {
    if (descriptors.length === 0) {
        return [];
    }

    const descriptorLength = descriptors[0].length;
    const average = new Array<number>(descriptorLength).fill(0);

    for (const descriptor of descriptors) {
        for (let i = 0; i < descriptorLength; i++) {
            average[i] += descriptor[i];
        }
    }

    for (let i = 0; i < descriptorLength; i++) {
        average[i] /= descriptors.length;
    }

    return average;
};

const getMouthOpenRatio = (detection: FaceDetectionWithDescriptor): number => {
    const mouth = detection.landmarks.getMouth();
    if (mouth.length < 19) {
        return 0;
    }

    const innerLeft = mouth[12];
    const innerRight = mouth[16];
    const innerTop = mouth[14];
    const innerBottom = mouth[18];

    const horizontal = distance(innerLeft, innerRight);
    if (horizontal === 0) {
        return 0;
    }

    const vertical = distance(innerTop, innerBottom);
    return vertical / horizontal;
};

const getNodMetric = (detection: FaceDetectionWithDescriptor): number | null => {
    const nosePoints = detection.landmarks.getNose();
    const leftEyePoints = detection.landmarks.getLeftEye();
    const rightEyePoints = detection.landmarks.getRightEye();

    if (nosePoints.length === 0 || leftEyePoints.length === 0 || rightEyePoints.length === 0) {
        return null;
    }

    const noseCenterPoint = nosePoints[Math.floor(nosePoints.length / 2)];
    const eyePoints = [...leftEyePoints, ...rightEyePoints];
    const eyeAvgY = eyePoints.reduce((sum, point) => sum + point.y, 0) / eyePoints.length;

    if (detection.detection.box.height === 0) {
        return null;
    }

    return (noseCenterPoint.y - eyeAvgY) / detection.detection.box.height;
};

const evaluateFaceAlignment = (
    detection: FaceDetectionWithDescriptor,
    video: HTMLVideoElement
): FaceAlignmentResult => {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (!videoWidth || !videoHeight) {
        return { ok: false, message: 'Waiting for camera video stream...' };
    }

    const box = detection.detection.box;
    const faceCenterX = box.x + box.width / 2;
    const faceCenterY = box.y + box.height / 2;
    const frameCenterX = videoWidth / 2;
    const frameCenterY = videoHeight / 2;

    const normalizedX = (faceCenterX - frameCenterX) / (videoWidth * 0.22);
    const normalizedY = (faceCenterY - frameCenterY) / (videoHeight * 0.28);
    const insideCenterEllipse = normalizedX ** 2 + normalizedY ** 2 <= 1;

    const faceWidthRatio = box.width / videoWidth;

    if (!insideCenterEllipse) {
        return { ok: false, message: 'Move your face to the center of the oval.' };
    }

    if (faceWidthRatio < 0.2) {
        return { ok: false, message: 'Move a little closer to the camera.' };
    }

    if (faceWidthRatio > 0.65) {
        return { ok: false, message: 'Move a little farther from the camera.' };
    }

    return { ok: true, message: '' };
};

export default function FaceVerificationSetup({ onSuccess, onCancel }: FaceVerificationSetupProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState('Initializing...');
    const [faceCaptured, setFaceCaptured] = useState(false);
    const [isCameraSupported, setIsCameraSupported] = useState(true);
    const [faceEncoding, setFaceEncoding] = useState<number[] | null>(null);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [challengeAction, setChallengeAction] = useState<LivenessAction>(randomLivenessAction);
    const [capturedFrameCount, setCapturedFrameCount] = useState(0);

    // Load face-api models
    useEffect(() => {
        const loadModels = async () => {
            try {
                setStatus('Loading face detection models...');
                const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api@master/model/';
                console.log('Loading models from:', MODEL_URL);

                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
                ]);

                setModelLoaded(true);
                setStatus('Models loaded. Requesting camera access...');
            } catch (err) {
                console.error('Model loading error:', err);
                setError(err instanceof Error ? err.message : 'Failed to load detection models');
                setIsLoading(false);
            }
        };

        loadModels();
    }, []);

    // Request camera access once models are loaded
    useEffect(() => {
        if (!modelLoaded) {
            return;
        }

        const requestCamera = async () => {
            try {
                setStatus('Requesting camera access...');

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Camera request timeout - please check browser permissions')), 10000);
                });

                const stream = await Promise.race([
                    navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            facingMode: 'user',
                        },
                    }),
                    timeoutPromise,
                ]) as MediaStream;

                setIsLoading(false);
                setStatus('Center your face in the oval to start liveness check.');

                setTimeout(() => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                }, 100);
            } catch (err) {
                console.error('Camera access error:', err);
                if (err instanceof DOMException && err.name === 'NotAllowedError') {
                    setIsCameraSupported(false);
                    setError('Camera access denied. Please enable camera permissions in System Preferences > Security & Privacy > Camera.');
                } else if (err instanceof DOMException && err.name === 'NotFoundError') {
                    setIsCameraSupported(false);
                    setError('No camera device found. Please ensure your device has a camera.');
                } else {
                    setError(err instanceof Error ? err.message : 'Failed to access camera');
                }
                setIsLoading(false);
            }
        };

        requestCamera();

        const currentVideo = videoRef.current;

        return () => {
            if (currentVideo && currentVideo.srcObject) {
                const tracks = (currentVideo.srcObject as MediaStream).getTracks();
                tracks.forEach((track) => track.stop());
            }
        };
    }, [modelLoaded]);

    const stopCameraStream = () => {
        if (videoRef.current) {
            if (videoRef.current.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach((track) => track.stop());
                videoRef.current.srcObject = null;
            }
            videoRef.current.pause();
        }
    };

    useEffect(() => {
        return () => {
            stopCameraStream();
        };
    }, []);

    // Detect and capture face with liveness and strict centering
    useEffect(() => {
        if (isLoading || !videoRef.current || faceCaptured || !modelLoaded) {
            return;
        }

        let detectionInterval: ReturnType<typeof setInterval> | null = null;
        let detectionInFlight = false;
        let livenessPassed = false;
        let mouthOpenStreak = 0;
        const nodMetrics: number[] = [];
        let captureStartedAt: number | null = null;
        const capturedDescriptors: number[][] = [];
        let missedFrames = 0;

        const resetCapture = () => {
            captureStartedAt = null;
            capturedDescriptors.length = 0;
            setCapturedFrameCount(0);
        };

        const detectFace = async () => {
            if (!videoRef.current || !canvasRef.current || detectionInFlight) {
                return;
            }

            if (videoRef.current.readyState < 2) {
                return;
            }

            detectionInFlight = true;

            try {
                const detectionRaw = await faceapi
                    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (!detectionRaw) {
                    missedFrames += 1;
                    if (missedFrames > 3) {
                        if (captureStartedAt !== null) {
                            resetCapture();
                            livenessPassed = false;
                            mouthOpenStreak = 0;
                            nodMetrics.length = 0;
                        }
                        setStatus(`Face not detected. ${getLivenessInstruction(challengeAction)} Keep centered.`);
                    }
                    return;
                }

                missedFrames = 0;

                const detection = detectionRaw as FaceDetectionWithDescriptor;
                const alignment = evaluateFaceAlignment(detection, videoRef.current);

                if (!alignment.ok) {
                    resetCapture();
                    livenessPassed = false;
                    mouthOpenStreak = 0;
                    nodMetrics.length = 0;
                    setStatus(`${alignment.message} ${getLivenessInstruction(challengeAction)}`);
                    return;
                }

                if (!livenessPassed) {
                    if (challengeAction === 'open_mouth') {
                        const mouthOpenRatio = getMouthOpenRatio(detection);
                        mouthOpenStreak = mouthOpenRatio >= MOUTH_OPEN_THRESHOLD ? mouthOpenStreak + 1 : Math.max(0, mouthOpenStreak - 1);
                        setStatus(`${getLivenessInstruction(challengeAction)} (${mouthOpenStreak}/${MOUTH_OPEN_REQUIRED_FRAMES})`);

                        if (mouthOpenStreak >= MOUTH_OPEN_REQUIRED_FRAMES) {
                            livenessPassed = true;
                            setStatus('Liveness confirmed. Capturing as many frames as possible...');
                        }
                        return;
                    }

                    const nodMetric = getNodMetric(detection);
                    if (nodMetric !== null) {
                        nodMetrics.push(nodMetric);
                        if (nodMetrics.length > 30) {
                            nodMetrics.shift();
                        }
                    }

                    const nodRange = nodMetrics.length > 0 ? Math.max(...nodMetrics) - Math.min(...nodMetrics) : 0;
                    setStatus(`${getLivenessInstruction(challengeAction)} Keep centered.`);

                    if (nodRange >= NOD_RANGE_THRESHOLD && nodMetrics.length >= 8) {
                        livenessPassed = true;
                        setStatus('Liveness confirmed. Capturing as many frames as possible...');
                    }
                    return;
                }

                if (captureStartedAt === null) {
                    captureStartedAt = Date.now();
                }

                capturedDescriptors.push(Array.from(detection.descriptor));

                if (capturedDescriptors.length === 1 || capturedDescriptors.length % 2 === 0) {
                    setCapturedFrameCount(capturedDescriptors.length);
                }

                const elapsedMs = Date.now() - captureStartedAt;
                const remainingMs = Math.max(0, SETUP_CAPTURE_WINDOW_MS - elapsedMs);
                const remainingSeconds = (remainingMs / 1000).toFixed(1);

                setStatus(`Capturing high-quality samples... ${capturedDescriptors.length} frames (${remainingSeconds}s left)`);

                if (elapsedMs >= SETUP_CAPTURE_WINDOW_MS || capturedDescriptors.length >= SETUP_MAX_CAPTURED_FRAMES) {
                    if (capturedDescriptors.length < SETUP_MIN_CAPTURED_FRAMES) {
                        setStatus(`Not enough stable frames. ${getLivenessInstruction(challengeAction)}`);
                        resetCapture();
                        livenessPassed = false;
                        mouthOpenStreak = 0;
                        nodMetrics.length = 0;
                        return;
                    }

                    const averagedDescriptor = averageDescriptors(capturedDescriptors);
                    setFaceEncoding(averagedDescriptor);
                    setCapturedFrameCount(capturedDescriptors.length);
                    setFaceCaptured(true);
                    setStatus(`Face captured from ${capturedDescriptors.length} frames. Ready to save.`);

                    if (detectionInterval) {
                        clearInterval(detectionInterval);
                    }
                }
            } catch (err) {
                console.error('Face detection error:', err);
            } finally {
                detectionInFlight = false;
            }
        };

        detectionInterval = setInterval(detectFace, 40);

        return () => {
            if (detectionInterval) {
                clearInterval(detectionInterval);
            }
        };
    }, [isLoading, faceCaptured, modelLoaded, challengeAction]);

    const handleSaveFace = async () => {
        if (!faceEncoding) {
            setError('No face encoding captured');
            return;
        }

        setIsSaving(true);
        try {
            setStatus('Saving face verification...');
            const response = await fetch('/api/face-verification/enable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ face_encoding: faceEncoding }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to save face verification');
            }

            setStatus('Face verification enabled successfully!');

            setTimeout(() => {
                stopCameraStream();
                if (onSuccess) {
                    onSuccess();
                }
                window.location.reload();
            }, 1000);
        } catch (err) {
            console.error('Error saving face:', err);
            setError(err instanceof Error ? err.message : 'Failed to save face verification');
            setStatus('');
            setIsSaving(false);
        }
    };

    const handleRetry = () => {
        const nextAction = randomLivenessAction();
        setChallengeAction(nextAction);
        setFaceCaptured(false);
        setFaceEncoding(null);
        setCapturedFrameCount(0);
        setError(null);
        setStatus(`Center your face in the oval. ${getLivenessInstruction(nextAction)}`);
    };

    const handleCancel = () => {
        stopCameraStream();
        if (onCancel) {
            onCancel();
        }
    };

    if (!isCameraSupported) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Face Verification Not Available</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <div className="space-y-3">
                        <button
                            onClick={handleCancel}
                            className="w-full px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition"
                        >
                            Continue Without Face Verification
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full overflow-hidden">
                <div className="bg-gradient-to-r from-[#1f5632] to-[#2d7a4a] p-6 text-white">
                    <h2 className="text-2xl font-bold">Set Up Face Verification</h2>
                    <p className="text-green-100 mt-2">Add an extra layer of security to your account</p>
                </div>

                <div className="p-6">
                    {isLoading && (
                        <div className="text-center py-8">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-[#1f5632]"></div>
                            <p className="mt-4 text-gray-600">{status}</p>
                        </div>
                    )}

                    {!isLoading && !faceCaptured && (
                        <div className="space-y-4">
                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                                    {error}
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-blue-800 font-semibold text-sm">Anti-spoof challenge</p>
                                <p className="text-blue-700 text-sm mt-1">{getLivenessInstruction(challengeAction)}</p>
                            </div>

                            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="w-full h-full object-cover"
                                />
                                <canvas
                                    ref={canvasRef}
                                    className="absolute top-0 left-0 w-full h-full"
                                />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="relative w-48 h-48">
                                        <svg className="w-full h-full" viewBox="0 0 200 200">
                                            <ellipse
                                                cx="100"
                                                cy="100"
                                                rx="80"
                                                ry="90"
                                                fill="none"
                                                stroke="rgba(79, 172, 116, 0.3)"
                                                strokeWidth="2"
                                            />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-gray-600 text-center">{status}</p>
                        </div>
                    )}

                    {!isLoading && faceCaptured && (
                        <div className="space-y-4">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <p className="text-green-700 font-semibold">Face captured successfully</p>
                                <p className="text-green-600 text-sm mt-1">
                                    Captured {capturedFrameCount} stable frames for high-quality verification.
                                </p>
                            </div>

                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <p className="text-green-700 font-semibold text-sm">Tips for best results:</p>
                                <ul className="text-green-600 text-sm mt-2 space-y-1">
                                    <li>- Ensure good lighting on your face</li>
                                    <li>- Look directly at the camera</li>
                                    <li>- Avoid glasses or sunglasses for first setup</li>
                                    <li>- Keep your face within the guide</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-gray-50 px-6 py-4 flex gap-3">
                    {!faceCaptured ? (
                        <>
                            <button
                                onClick={handleCancel}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition font-medium"
                            >
                                Skip
                            </button>
                            <button
                                disabled={isLoading || !faceCaptured}
                                className="flex-1 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed font-medium"
                            >
                                Save Face
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={handleRetry}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition font-medium"
                            >
                                Retake
                            </button>
                            <button
                                onClick={handleSaveFace}
                                disabled={isSaving}
                                className={`flex-1 px-4 py-2 text-white rounded-lg transition font-medium ${isSaving
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-[#1f5632] hover:bg-[#2d7a4a]'
                                    }`}
                            >
                                {isSaving ? 'Saving...' : 'Save Face'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}