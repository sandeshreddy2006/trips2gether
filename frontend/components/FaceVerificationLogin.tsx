'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

type LivenessAction = 'open_mouth' | 'blink';

interface FaceVerificationLoginProps {
    onSuccess: () => void;
    onSkip: () => void;
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

const LOGIN_CAPTURE_WINDOW_MS = 5000;
const LOGIN_MIN_CAPTURED_FRAMES = 12;
const LOGIN_MAX_CAPTURED_FRAMES = 200;
const MOUTH_OPEN_THRESHOLD = 0.3;
const MOUTH_OPEN_REQUIRED_FRAMES = 3;
const BLINK_FALLBACK_THRESHOLD = 0.2;
const BLINK_MIN_THRESHOLD = 0.16;
const BLINK_MAX_THRESHOLD = 0.26;
const BLINK_DYNAMIC_RATIO = 0.78;
const BLINK_BASELINE_ALPHA = 0.08;
const BLINK_REOPEN_MARGIN = 0.015;
const BLINK_MIN_CLOSED_FRAMES = 1;
const BLINK_REQUIRED_COUNT = 1;

const createLivenessSequence = (): LivenessAction[] => {
    const base: LivenessAction[] = Math.random() < 0.5
        ? ['open_mouth', 'blink']
        : ['blink', 'open_mouth'];

    // Randomly add a third action for stronger anti-replay.
    if (Math.random() < 0.5) {
        const thirdAction: LivenessAction = Math.random() < 0.5 ? 'open_mouth' : 'blink';
        return [...base, thirdAction];
    }

    return base;
};

const getLivenessInstruction = (action: LivenessAction): string => (
    action === 'open_mouth'
        ? 'Open your mouth for a moment.'
        : 'Blink once naturally.'
);

const getChallengeStatusText = (sequence: LivenessAction[], stepIndex: number): string => {
    if (sequence.length === 0) {
        return 'Perform the liveness check.';
    }

    const safeIndex = Math.min(stepIndex, sequence.length - 1);
    return `Liveness step ${safeIndex + 1}/${sequence.length}: ${getLivenessInstruction(sequence[safeIndex])}`;
};

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

const getEyeAspectRatio = (eyePoints: faceapi.Point[]): number | null => {
    if (eyePoints.length < 6) {
        return null;
    }

    const verticalOne = distance(eyePoints[1], eyePoints[5]);
    const verticalTwo = distance(eyePoints[2], eyePoints[4]);
    const horizontal = distance(eyePoints[0], eyePoints[3]);

    if (horizontal === 0) {
        return null;
    }

    return (verticalOne + verticalTwo) / (2 * horizontal);
};

const getAverageEyeAspectRatio = (detection: FaceDetectionWithDescriptor): number | null => {
    const left = getEyeAspectRatio(detection.landmarks.getLeftEye());
    const right = getEyeAspectRatio(detection.landmarks.getRightEye());

    if (left === null || right === null) {
        return null;
    }

    return (left + right) / 2;
};

const getAdaptiveBlinkThreshold = (baselineEar: number | null): number => {
    if (baselineEar === null) {
        return BLINK_FALLBACK_THRESHOLD;
    }

    const dynamicThreshold = baselineEar * BLINK_DYNAMIC_RATIO;
    return Math.min(BLINK_MAX_THRESHOLD, Math.max(BLINK_MIN_THRESHOLD, dynamicThreshold));
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

    const normalizedX = (faceCenterX - frameCenterX) / (videoWidth * 0.36);
    const normalizedY = (faceCenterY - frameCenterY) / (videoHeight * 0.5);
    const insideCenterEllipse = normalizedX ** 2 + normalizedY ** 2 <= 1;

    const faceWidthRatio = box.width / videoWidth;

    if (!insideCenterEllipse) {
        return { ok: false, message: 'Move your face to the center of the oval.' };
    }

    if (faceWidthRatio < 0.1) {
        return { ok: false, message: 'Move a little closer to the camera.' };
    }

    if (faceWidthRatio > 0.65) {
        return { ok: false, message: 'Move a little farther from the camera.' };
    }

    return { ok: true, message: '' };
};

export default function FaceVerificationLogin({ onSuccess, onSkip }: FaceVerificationLoginProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('Initializing camera...');
    const [isCameraSupported, setIsCameraSupported] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [challengeSequence, setChallengeSequence] = useState<LivenessAction[]>(() => createLivenessSequence());
    const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
    const [capturedFrameCount, setCapturedFrameCount] = useState(0);

    // Load face-api models
    useEffect(() => {
        const loadModels = async () => {
            try {
                setStatus('Loading face detection models...');
                const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api@master/model/';

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
                    setError('No camera device found on this device.');
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

    const stopCameraStream = useCallback(() => {
        if (videoRef.current) {
            if (videoRef.current.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach((track) => track.stop());
                videoRef.current.srcObject = null;
            }
            videoRef.current.pause();
        }
    }, []);

    useEffect(() => {
        return () => {
            stopCameraStream();
        };
    }, [stopCameraStream]);

    const verifyFace = useCallback(async (faceEncoding: number[], sampleCount: number) => {
        setVerifying(true);
        setStatus(`Verifying face using ${sampleCount} frames...`);

        try {
            const response = await fetch('/api/face-verification/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ face_encoding: faceEncoding }),
            });

            const data = await response.json();

            if (data.success) {
                setStatus('Verification successful!');
                stopCameraStream();
                setTimeout(onSuccess, 1000);
            } else {
                const nextSequence = createLivenessSequence();
                setError(data.message || 'Face verification failed');
                setChallengeSequence(nextSequence);
                setCurrentChallengeIndex(0);
                setCapturedFrameCount(0);
                setStatus(`Verification failed. ${getChallengeStatusText(nextSequence, 0)}`);
                setVerifying(false);
            }
        } catch (err) {
            const nextSequence = createLivenessSequence();
            setError(err instanceof Error ? err.message : 'Verification error');
            setChallengeSequence(nextSequence);
            setCurrentChallengeIndex(0);
            setCapturedFrameCount(0);
            setStatus(`Verification failed. ${getChallengeStatusText(nextSequence, 0)}`);
            setVerifying(false);
        }
    }, [onSuccess, stopCameraStream]);

    // Detect and verify face with liveness and strict centering
    useEffect(() => {
        if (isLoading || !videoRef.current || verifying || !modelLoaded) {
            return;
        }

        let detectionInterval: ReturnType<typeof setInterval> | null = null;
        let detectionInFlight = false;
        let mouthOpenStreak = 0;
        let eyeClosedStreak = 0;
        let blinkCount = 0;
        let eyeOpenBaselineEar: number | null = null;
        let blinkArmed = true;
        let advancingChallengeStep = false;
        let captureStartedAt: number | null = null;
        const capturedDescriptors: number[][] = [];
        let missedFrames = 0;

        const resetCapture = () => {
            captureStartedAt = null;
            capturedDescriptors.length = 0;
            setCapturedFrameCount(0);
        };

        const detectAndVerify = async () => {
            if (!videoRef.current || !canvasRef.current || verifying || detectionInFlight) {
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
                        if (captureStartedAt !== null || currentChallengeIndex > 0) {
                            resetCapture();
                            mouthOpenStreak = 0;
                            eyeClosedStreak = 0;
                            blinkCount = 0;
                            eyeOpenBaselineEar = null;
                            blinkArmed = true;
                            advancingChallengeStep = false;
                            if (currentChallengeIndex !== 0) {
                                setCurrentChallengeIndex(0);
                            }
                        }
                        setStatus(`Face not detected. ${getChallengeStatusText(challengeSequence, 0)} Keep centered.`);
                    }
                    return;
                }

                missedFrames = 0;

                const detection = detectionRaw as FaceDetectionWithDescriptor;
                const alignment = evaluateFaceAlignment(detection, videoRef.current);

                if (!alignment.ok) {
                    resetCapture();
                    mouthOpenStreak = 0;
                    eyeClosedStreak = 0;
                    blinkCount = 0;
                    eyeOpenBaselineEar = null;
                    blinkArmed = true;
                    advancingChallengeStep = false;
                    if (currentChallengeIndex !== 0) {
                        setCurrentChallengeIndex(0);
                    }
                    setStatus(`${alignment.message} ${getChallengeStatusText(challengeSequence, 0)}`);
                    return;
                }

                const challengeComplete = currentChallengeIndex >= challengeSequence.length;
                const activeChallenge = challengeSequence[Math.min(currentChallengeIndex, challengeSequence.length - 1)];

                if (!challengeComplete) {
                    if (advancingChallengeStep) {
                        return;
                    }

                    if (activeChallenge === 'open_mouth') {
                        const mouthOpenRatio = getMouthOpenRatio(detection);
                        mouthOpenStreak = mouthOpenRatio >= MOUTH_OPEN_THRESHOLD ? mouthOpenStreak + 1 : Math.max(0, mouthOpenStreak - 1);
                        setStatus(`Liveness step ${currentChallengeIndex + 1}/${challengeSequence.length}: ${getLivenessInstruction(activeChallenge)} (${mouthOpenStreak}/${MOUTH_OPEN_REQUIRED_FRAMES})`);

                        if (mouthOpenStreak >= MOUTH_OPEN_REQUIRED_FRAMES) {
                            advancingChallengeStep = true;
                            const nextIndex = currentChallengeIndex + 1;
                            setCurrentChallengeIndex(nextIndex);
                            setStatus(nextIndex >= challengeSequence.length
                                ? 'Liveness confirmed. Collecting verification frames...'
                                : getChallengeStatusText(challengeSequence, nextIndex));
                        }
                        return;
                    }

                    const eyeAspectRatio = getAverageEyeAspectRatio(detection);
                    if (eyeAspectRatio !== null) {
                        const blinkThreshold = getAdaptiveBlinkThreshold(eyeOpenBaselineEar);
                        const eyesClosed = eyeAspectRatio < blinkThreshold;

                        if (!eyesClosed) {
                            eyeOpenBaselineEar = eyeOpenBaselineEar === null
                                ? eyeAspectRatio
                                : (eyeOpenBaselineEar * (1 - BLINK_BASELINE_ALPHA)) + (eyeAspectRatio * BLINK_BASELINE_ALPHA);
                        }

                        if (eyesClosed && blinkArmed) {
                            eyeClosedStreak += 1;
                        } else if (!eyesClosed) {
                            if (eyeClosedStreak >= BLINK_MIN_CLOSED_FRAMES && blinkArmed) {
                                blinkCount += 1;
                                blinkArmed = false;
                            }

                            eyeClosedStreak = 0;
                            const rearmThreshold = getAdaptiveBlinkThreshold(eyeOpenBaselineEar);
                            if (eyeAspectRatio > rearmThreshold + BLINK_REOPEN_MARGIN) {
                                blinkArmed = true;
                            }
                        }
                    }

                    setStatus(`Liveness step ${currentChallengeIndex + 1}/${challengeSequence.length}: ${getLivenessInstruction(activeChallenge)} (${blinkCount}/${BLINK_REQUIRED_COUNT})`);

                    if (blinkCount >= BLINK_REQUIRED_COUNT) {
                        advancingChallengeStep = true;
                        const nextIndex = currentChallengeIndex + 1;
                        setCurrentChallengeIndex(nextIndex);
                        setStatus(nextIndex >= challengeSequence.length
                            ? 'Liveness confirmed. Collecting verification frames...'
                            : getChallengeStatusText(challengeSequence, nextIndex));
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
                const remainingMs = Math.max(0, LOGIN_CAPTURE_WINDOW_MS - elapsedMs);
                const remainingSeconds = (remainingMs / 1000).toFixed(1);

                setStatus(`Collecting verification frames... ${capturedDescriptors.length} (${remainingSeconds}s left)`);

                if (elapsedMs >= LOGIN_CAPTURE_WINDOW_MS || capturedDescriptors.length >= LOGIN_MAX_CAPTURED_FRAMES) {
                    if (capturedDescriptors.length < LOGIN_MIN_CAPTURED_FRAMES) {
                        setStatus(`Need a few more stable frames. ${getChallengeStatusText(challengeSequence, 0)}`);
                        resetCapture();
                        mouthOpenStreak = 0;
                        eyeClosedStreak = 0;
                        blinkCount = 0;
                        eyeOpenBaselineEar = null;
                        blinkArmed = true;
                        advancingChallengeStep = false;
                        if (currentChallengeIndex !== 0) {
                            setCurrentChallengeIndex(0);
                        }
                        return;
                    }

                    const averagedDescriptor = averageDescriptors(capturedDescriptors);
                    if (detectionInterval) {
                        clearInterval(detectionInterval);
                    }

                    verifyFace(averagedDescriptor, capturedDescriptors.length);
                }
            } catch (err) {
                console.error('Face detection error:', err);
            } finally {
                detectionInFlight = false;
            }
        };

        detectionInterval = setInterval(detectAndVerify, 40);

        return () => {
            if (detectionInterval) {
                clearInterval(detectionInterval);
            }
        };
    }, [isLoading, verifying, modelLoaded, currentChallengeIndex, challengeSequence, verifyFace]);

    const handleSkip = () => {
        stopCameraStream();
        onSkip();
    };

    const activeChallenge = currentChallengeIndex < challengeSequence.length
        ? challengeSequence[currentChallengeIndex]
        : null;

    if (!isCameraSupported) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-8 max-w-md w-full">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Camera Not Available</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={handleSkip}
                        className="w-full px-4 py-2 bg-[#1f5632] text-white rounded-lg hover:bg-[#2d7a4a] transition font-medium"
                    >
                        Continue Without Face Verification
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full overflow-hidden">
                <div className="bg-gradient-to-r from-[#1f5632] to-[#2d7a4a] p-6 text-white">
                    <h2 className="text-2xl font-bold">Face Verification</h2>
                    <p className="text-green-100 mt-2">Verify your identity with face recognition</p>
                </div>

                <div className="p-6">
                    {isLoading && (
                        <div className="text-center py-12">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-[#1f5632]"></div>
                            <p className="mt-4 text-gray-600">{status}</p>
                        </div>
                    )}

                    {!isLoading && (
                        <div className="space-y-4">
                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                                    <p className="font-semibold mb-2">Verification Failed</p>
                                    <p className="text-sm">{error}</p>
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-blue-800 font-semibold text-sm">Anti-spoof challenge</p>
                                {activeChallenge ? (
                                    <p className="text-blue-700 text-sm mt-1">
                                        Step {currentChallengeIndex + 1}/{challengeSequence.length}: {getLivenessInstruction(activeChallenge)}
                                    </p>
                                ) : (
                                    <p className="text-blue-700 text-sm mt-1">Liveness complete. Hold still...</p>
                                )}
                                {capturedFrameCount > 0 && (
                                    <p className="text-blue-700 text-xs mt-1">Captured frames: {capturedFrameCount}</p>
                                )}
                            </div>

                            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="w-full h-full object-cover"
                                    style={{ transform: 'scaleX(-1)' }}
                                />
                                <canvas
                                    ref={canvasRef}
                                    className="absolute top-0 left-0 w-full h-full"
                                    style={{ transform: 'scaleX(-1)' }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="relative w-80 h-80">
                                        <svg className="w-full h-full" viewBox="0 0 200 200">
                                            <ellipse
                                                cx="100"
                                                cy="100"
                                                rx="90"
                                                ry="98"
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
                </div>

                <div className="bg-gray-50 px-6 py-4 flex gap-3">
                    <button
                        onClick={handleSkip}
                        disabled={verifying}
                        className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
                    >
                        Skip
                    </button>
                    <button
                        disabled={verifying || isLoading}
                        className="flex-1 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed font-medium"
                    >
                        {verifying ? 'Verifying...' : 'Verify'}
                    </button>
                </div>
            </div>
        </div>
    );
}