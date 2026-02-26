'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';

interface FaceVerificationLoginProps {
    onSuccess: () => void;
    onSkip: () => void;
}

export default function FaceVerificationLogin({ onSuccess, onSkip }: FaceVerificationLoginProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('Initializing camera...');
    const [isCameraSupported, setIsCameraSupported] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [modelLoaded, setModelLoaded] = useState(false);

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
                console.log('Models loaded successfully');
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
        if (!modelLoaded) return;

        const requestCamera = async () => {
            try {
                setStatus('Requesting camera access...');
                console.log('Requesting camera access');

                // Create a timeout promise to prevent hanging
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Camera request timeout - please check browser permissions')), 10000);
                });

                const stream = await Promise.race([
                    navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            facingMode: 'user'
                        }
                    }),
                    timeoutPromise
                ]) as MediaStream;

                console.log('Camera stream obtained:', stream);

                // Set isLoading to false FIRST so video element renders
                setIsLoading(false);
                setStatus('Position your face in the center');

                // Then attach stream after a brief delay to ensure video element is in DOM
                setTimeout(() => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        console.log('Stream attached to video element');
                    } else {
                        console.warn('Video ref is null, could not attach stream');
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

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach(track => track.stop());
            }
        };
    }, [modelLoaded]);

    // Auto-detect and verify face
    useEffect(() => {
        if (isLoading || !videoRef.current || verifying || !modelLoaded) {
            console.log('Face verification detection skip - isLoading:', isLoading, 'videoRef:', !!videoRef.current, 'verifying:', verifying, 'modelLoaded:', modelLoaded);
            return;
        }

        let detectionInterval: NodeJS.Timeout;
        let frameCount = 0;
        const requiredFrames = 15; // Multiple frames for stability
        let detectionStarted = false;
        let readyStateWarningLogged = false;

        const detectAndVerify = async () => {
            if (!videoRef.current || verifying) {
                return;
            }

            // Check if video has enough data to process
            if (videoRef.current.readyState < 2) {
                if (!readyStateWarningLogged) {
                    console.log('Video not ready - readyState:', videoRef.current.readyState, '(need at least 2)');
                    readyStateWarningLogged = true;
                }
                return;
            }

            if (!detectionStarted) {
                console.log('✓ Face verification detection started');
                detectionStarted = true;
            }

            try {
                const detection = await faceapi
                    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (detection) {
                    frameCount++;
                    if (frameCount % 3 === 0) {
                        console.log(`Face verification frame ${frameCount}/${requiredFrames}`);
                    }
                    setStatus(`Face detected! Verifying... (${frameCount}/${requiredFrames})`);

                    if (frameCount >= requiredFrames) {
                        // Send for verification
                        clearInterval(detectionInterval);
                        verifyFace(Array.from(detection.descriptor));
                    }
                } else {
                    if (frameCount > 0) {
                        frameCount = 0;
                        console.log('Face lost during verification, restarting count...');
                    }
                    setStatus('Position your face in the center');
                }
            } catch (err) {
                console.error('Face detection error:', err);
            }
        };

        detectionInterval = setInterval(detectAndVerify, 33);

        return () => clearInterval(detectionInterval);
    }, [isLoading, verifying, modelLoaded]);

    // Stop camera stream
    const stopCameraStream = () => {
        console.log('Stopping camera stream...');
        if (videoRef.current) {
            // Stop all tracks
            if (videoRef.current.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach(track => {
                    track.stop();
                    console.log('Track stopped:', track.kind);
                });
                videoRef.current.srcObject = null;
            }
            // Also pause the video
            videoRef.current.pause();
        }
        console.log('Camera stream fully stopped');
    };

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            console.log('Component unmounting, cleaning up camera...');
            stopCameraStream();
        };
    }, []);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            console.log('Component unmounting, cleaning up camera...');
            stopCameraStream();
        };
    }, []);

    // Handle skip - stop camera and close
    const handleSkip = () => {
        console.log('Skipping face verification...');
        stopCameraStream();
        onSkip();
    };

    const verifyFace = async (faceEncoding: number[]) => {
        setVerifying(true);
        setStatus('Verifying face...');

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/face-verification/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ face_encoding: faceEncoding }),
            });

            const data = await response.json();

            if (data.success) {
                setStatus('✓ Verification successful!');
                stopCameraStream();
                setTimeout(onSuccess, 1500);
            } else {
                setError(data.message || 'Face verification failed');
                setStatus('');
                setVerifying(false);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification error');
            setStatus('');
            setVerifying(false);
        }
    };

    // If camera not supported
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
                {/* Header */}
                <div className="bg-gradient-to-r from-[#1f5632] to-[#2d7a4a] p-6 text-white">
                    <h2 className="text-2xl font-bold">Face Verification</h2>
                    <p className="text-green-100 mt-2">Verify your identity with face recognition</p>
                </div>

                {/* Content */}
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
                                {/* Face detection guide */}
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
                </div>

                {/* Footer */}
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
