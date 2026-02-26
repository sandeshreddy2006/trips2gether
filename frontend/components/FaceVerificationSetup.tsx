'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';

interface FaceVerificationSetupProps {
    onSuccess?: () => void;
    onCancel?: () => void;
}

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

    // Load face-api models
    useEffect(() => {
        const loadModels = async () => {
            try {
                setStatus('Loading face detection models...');
                const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api@master/model/';
                console.log('Loading models from:', MODEL_URL);

                const startTime = Date.now();
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
                ]);
                const loadTime = Date.now() - startTime;
                console.log(`✓ Models loaded in ${loadTime}ms`);
                console.log('tinyFaceDetector loaded:', faceapi.nets.tinyFaceDetector.isLoaded);
                console.log('faceLandmark68Net loaded:', faceapi.nets.faceLandmark68Net.isLoaded);
                console.log('faceRecognitionNet loaded:', faceapi.nets.faceRecognitionNet.isLoaded);
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

                // Create a timeout promise
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
                setStatus('Position your face in the center and keep still for 3 seconds...');

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
                    setError('No camera device found. Please ensure your device has a camera.');
                } else {
                    setError(err instanceof Error ? err.message : 'Failed to access camera');
                }
                setIsLoading(false);
            }
        };

        requestCamera();

        return () => {
            // Cleanup: stop video stream
            if (videoRef.current && videoRef.current.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach(track => track.stop());
            }
        };
    }, [modelLoaded]);

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

    // Detect and capture face
    useEffect(() => {
        if (isLoading || !videoRef.current || faceCaptured || !modelLoaded) {
            console.log('Face detection skip - isLoading:', isLoading, 'videoRef:', !!videoRef.current, 'faceCaptured:', faceCaptured, 'modelLoaded:', modelLoaded);
            return;
        }

        let detectionInterval: NodeJS.Timeout;
        let frameCount = 0;
        const requiredFrames = 30; // 30 frames at ~30fps = ~1 second
        let detectionStarted = false;
        let readyStateWarningLogged = false;

        const detectFace = async () => {
            if (!videoRef.current || !canvasRef.current) {
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
                console.log('✓ Face detection started, analyzing video frames...');
                detectionStarted = true;
            }

            try {
                const detection = await faceapi
                    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (detection) {
                    frameCount++;
                    if (frameCount % 5 === 0) {
                        console.log(`Face frame ${frameCount}/30`);
                    }
                    setStatus(`Face detected! Keep still... (${frameCount}/30 frames captured)`);

                    if (frameCount >= requiredFrames) {
                        // Capture this frame as the face to use
                        const descriptor = detection.descriptor;
                        setFaceEncoding(Array.from(descriptor));
                        setFaceCaptured(true);
                        setStatus('Face captured! Setting up verification...');
                        clearInterval(detectionInterval);
                        console.log('✓ Face captured and encoding saved');
                    }
                } else {
                    if (frameCount > 0) {
                        frameCount = 0;
                        console.log('Face lost, restarting count...');
                    }
                    setStatus('Position your face in the center and keep still...');
                }
            } catch (err) {
                console.error('Face detection error:', err);
            }
        };

        detectionInterval = setInterval(detectFace, 33); // ~30fps

        return () => {
            clearInterval(detectionInterval);
        };
    }, [isLoading, faceCaptured, modelLoaded]);

    // Save face encoding to backend
    const handleSaveFace = async () => {
        if (!faceEncoding) {
            setError('No face encoding captured');
            return;
        }

        setIsSaving(true);
        try {
            setStatus('Saving face verification...');
            console.log('Saving face encoding to backend...');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/face-verification/enable`, {
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

            console.log('✓ Face verification saved successfully!');
            setStatus('Face verification enabled successfully!');

            // Close modal after short delay
            setTimeout(() => {
                console.log('Calling onSuccess callback to close modal...');
                stopCameraStream();
                if (onSuccess) {
                    onSuccess();
                } else {
                    console.warn('onSuccess callback not provided');
                }
            }, 1000);
        } catch (err) {
            console.error('Error saving face:', err);
            setError(err instanceof Error ? err.message : 'Failed to save face verification');
            setStatus('');
            setIsSaving(false);
        }
    };

    // Retry capture
    const handleRetry = () => {
        setFaceCaptured(false);
        setFaceEncoding(null);
        setError(null);
        setStatus('Position your face in the center and keep still...');
    };

    // Handle cancel - stop camera and close
    const handleCancel = () => {
        console.log('Closing face verification modal...');
        stopCameraStream();
        if (onCancel) {
            onCancel();
        }
    };

    // If camera not supported, show alternative
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
                {/* Header */}
                <div className="bg-gradient-to-r from-[#1f5632] to-[#2d7a4a] p-6 text-white">
                    <h2 className="text-2xl font-bold">Set Up Face Verification</h2>
                    <p className="text-green-100 mt-2">Add an extra layer of security to your account</p>
                </div>

                {/* Content */}
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
                                        {/* Oval guide */}
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
                                <p className="text-green-700 font-semibold">✓ Face captured successfully!</p>
                                <p className="text-green-600 text-sm mt-1">Your face will be used for verification on future logins.</p>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-blue-700 font-semibold text-sm">💡 Tips for best results:</p>
                                <ul className="text-blue-600 text-sm mt-2 space-y-1">
                                    <li>• Ensure good lighting on your face</li>
                                    <li>• Look directly at the camera</li>
                                    <li>• Avoid glasses or sunglasses for first setup</li>
                                    <li>• Keep your face within the guide</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
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
