import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Scissors,
  Sliders,
  Type,
  Volume2,
  VolumeX,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Image as ImageIcon
} from 'lucide-react';
import { createReelUploadJob, waitForReelPublication, ReelEditManifest } from '@jamsh/api';

interface WebCreateReelModalProps {
  visible: boolean;
  onClose: () => void;
  onReelCreated?: (reelId: string) => void;
}

type Step = 'SELECT_SOURCE' | 'RECORDING' | 'EDIT' | 'PUBLISH_DETAILS' | 'PROCESSING';

export const WebCreateReelModal: React.FC<WebCreateReelModalProps> = ({ visible, onClose, onReelCreated }) => {
  const [step, setStep] = useState<Step>('SELECT_SOURCE');
  
  // Media source state
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [videoDims, setVideoDims] = useState<{ width: number; height: number }>({ width: 720, height: 1280 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Camera Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  // Editor state
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [selectedFilter, setSelectedFilter] = useState<'none' | 'cyber_gold' | 'dark_neon' | 'cyber_mono' | 'vivid_contrast'>('none');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [overlayText, setOverlayText] = useState<string>('');
  const [overlayPosition, setOverlayPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [coverTime, setCoverTime] = useState<number>(0.5);

  // Preview video playback
  const [isPlaying, setIsPlaying] = useState(true);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Publication metadata
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('jamsh, cyberpunk, reels');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [allowComments, setAllowComments] = useState(true);

  // Upload & processing status
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processStatus, setProcessStatus] = useState<string>('Initializing upload...');
  const [jobId, setJobId] = useState<string | null>(null);

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
  };

  // Clean up Object URLs when changing or unmounting
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      stopCameraStream();
    };
  }, [videoUrl]);

  // Camera handling
  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    stopCameraStream();
    setErrorMsg(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: mode, width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      setHasCameraPermission(true);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => undefined);
      }
    } catch (err: any) {
      console.warn('Camera permission or device error:', err);
      setHasCameraPermission(false);
      setErrorMsg('Camera access was denied or is unavailable. Please grant permission or choose a video file.');
    }
  };

  const handleStartRecording = () => {
    if (!mediaStreamRef.current) return;
    recordedChunksRef.current = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

      const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        handleLoadedVideo(fullBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 179) {
            handleStopRecording();
            return 180;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      setErrorMsg('Failed to start recording: ' + err.message);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopCameraStream();
    setIsRecording(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 200 * 1024 * 1024) {
      setErrorMsg('Video file size exceeds the 200 MB maximum.');
      return;
    }
    handleLoadedVideo(file);
  };

  const handleLoadedVideo = (blob: Blob) => {
    setErrorMsg(null);
    setVideoBlob(blob);
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);

    // Probe duration and dimensions
    const probeVid = document.createElement('video');
    probeVid.src = url;
    probeVid.onloadedmetadata = () => {
      const dur = probeVid.duration || 15;
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(dur);
      setCoverTime(Math.min(1.0, dur * 0.2));
      setVideoDims({
        width: probeVid.videoWidth || 720,
        height: probeVid.videoHeight || 1280
      });
      setStep('EDIT');
    };
    probeVid.onerror = () => {
      setErrorMsg('Could not read the video stream. Please ensure the video format is supported.');
    };
  };

  // Preview Loop Enforcement (Trim bounds & Speed)
  useEffect(() => {
    const vid = previewVideoRef.current;
    if (!vid) return;

    vid.playbackRate = playbackSpeed;
    vid.volume = volume;

    const handleTimeUpdate = () => {
      if (vid.currentTime >= trimEnd) {
        vid.currentTime = trimStart;
        void vid.play().catch(() => undefined);
      }
    };

    vid.addEventListener('timeupdate', handleTimeUpdate);
    return () => vid.removeEventListener('timeupdate', handleTimeUpdate);
  }, [trimStart, trimEnd, playbackSpeed, volume]);

  const togglePreviewPlay = () => {
    const vid = previewVideoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play();
      setIsPlaying(true);
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  // Filter CSS mapping
  const getFilterStyle = (): React.CSSProperties => {
    switch (selectedFilter) {
      case 'cyber_gold':
        return { filter: 'contrast(1.15) saturate(1.25) sepia(0.2) hue-rotate(-10deg)' };
      case 'dark_neon':
        return { filter: 'contrast(1.3) saturate(1.5) brightness(0.95)' };
      case 'cyber_mono':
        return { filter: 'grayscale(1) contrast(1.25) brightness(0.95)' };
      case 'vivid_contrast':
        return { filter: 'contrast(1.25) saturate(1.3)' };
      default:
        return {};
    }
  };

  // Publish flow
  const handlePublish = async () => {
    if (!videoBlob) return;
    setStep('PROCESSING');
    setUploadProgress(10);
    setProcessStatus('Preparing video & edit manifest...');

    try {
      const parsedTags = hashtags
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const editManifest: ReelEditManifest = {
        version: 1,
        clips: [{
          path: 'source',
          trimStart,
          trimEnd,
          speed: playbackSpeed,
          volume,
        }],
        filter: selectedFilter,
        coverTimeSeconds: coverTime,
        textOverlays: overlayText ? [{
          text: overlayText,
          start: 0,
          end: trimEnd - trimStart,
          x: 50,
          y: overlayPosition === 'top' ? 15 : overlayPosition === 'center' ? 50 : 85,
          color: '#F59A18',
          fontSize: 36
        }] : []
      };

      setUploadProgress(25);
      setProcessStatus('Uploading media to protected ingest bucket...');

      const job = await createReelUploadJob(
        videoBlob,
        {
          caption: caption.trim() || 'JamSh Reel',
          hashtags: parsedTags,
          interests: [],
          visibility,
          duration: Math.max(1, trimEnd - trimStart),
          width: videoDims.width,
          height: videoDims.height,
          editManifest
        },
        (progress) => {
          setUploadProgress(Math.min(75, Math.round(progress)));
        }
      );

      setJobId(job.jobId);
      setUploadProgress(80);
      setProcessStatus('FFmpeg worker claimed job: transcoding & rendering edits...');

      // Track worker completion
      const completedJob = await waitForReelPublication(job.jobId, {
        timeoutMs: 300000,
        intervalMs: 2500,
        onStatus: (st) => {
          if (st.status === 'processing') {
            setProcessStatus('Processing HLS multi-bitrate streams & thumbnail...');
            setUploadProgress(90);
          }
        }
      });

      if (completedJob.status === 'completed') {
        setUploadProgress(100);
        setProcessStatus('Reel Published Successfully! 🎬');
        setTimeout(() => {
          onReelCreated?.(completedJob.video_id || job.videoId);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      console.error('Publication error:', err);
      setErrorMsg(err?.message || 'Failed to complete Reel publication. You can retry.');
    }
  };

  if (!visible) return null;

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step !== 'SELECT_SOURCE' && step !== 'PROCESSING' && (
              <button
                style={styles.iconBtn}
                onClick={() => {
                  if (step === 'RECORDING') {
                    stopCameraStream();
                    setStep('SELECT_SOURCE');
                  } else if (step === 'EDIT') {
                    setStep('SELECT_SOURCE');
                  } else if (step === 'PUBLISH_DETAILS') {
                    setStep('EDIT');
                  }
                }}
              >
                <ArrowLeft size={20} color="#F59A18" />
              </button>
            )}
            <h2 style={styles.title}>
              {step === 'SELECT_SOURCE' && '🎬 Create New Reel'}
              {step === 'RECORDING' && '📹 Record Video'}
              {step === 'EDIT' && '⚡ Reel Studio'}
              {step === 'PUBLISH_DETAILS' && '🚀 Publish Settings'}
              {step === 'PROCESSING' && '⚙️ Processing Reel'}
            </h2>
          </div>
          {step !== 'PROCESSING' && (
            <button style={styles.iconBtn} onClick={onClose}>
              <X size={22} color="#FFF" />
            </button>
          )}
        </div>

        {errorMsg && (
          <div style={styles.errorAlert}>
            <AlertCircle size={18} color="#ED4956" />
            <span style={{ fontSize: 13 }}>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div style={styles.body}>
          {/* STEP 1: SELECT SOURCE */}
          {step === 'SELECT_SOURCE' && (
            <div style={styles.sourceGrid}>
              {/* Option A: Record with Camera */}
              <div
                style={styles.sourceCard}
                onClick={() => {
                  setStep('RECORDING');
                  startCamera('user');
                }}
              >
                <div style={styles.iconCircle}>
                  <Camera size={36} color="#F59A18" />
                </div>
                <h3 style={styles.cardTitle}>Record Camera Video</h3>
                <p style={styles.cardDesc}>Capture live short video directly from your webcam or phone camera</p>
                <span style={styles.cardAction}>Start Recording ›</span>
              </div>

              {/* Option B: Choose from Gallery / File */}
              <label style={styles.sourceCard}>
                <input
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <div style={styles.iconCircle}>
                  <Upload size={36} color="#F59A18" />
                </div>
                <h3 style={styles.cardTitle}>Select from Gallery</h3>
                <p style={styles.cardDesc}>Upload an existing MP4, WebM, or MOV video clip from your device</p>
                <span style={styles.cardAction}>Browse Files ›</span>
              </label>
            </div>
          )}

          {/* STEP 2: CAMERA RECORDING */}
          {step === 'RECORDING' && (
            <div style={styles.cameraContainer}>
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                style={styles.cameraPreview}
              />

              {/* Top Controls: Flip camera & Timer */}
              <div style={styles.cameraTopBar}>
                <div style={styles.timerBadge}>
                  <div style={[styles.recordDot, isRecording ? styles.recordDotActive : {}] as any} />
                  <span>{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')} / 3:00</span>
                </div>
                <button
                  style={styles.flipBtn}
                  onClick={() => {
                    const nextMode = facingMode === 'user' ? 'environment' : 'user';
                    setFacingMode(nextMode);
                    startCamera(nextMode);
                  }}
                >
                  <RotateCcw size={18} color="#FFF" />
                  <span>Flip</span>
                </button>
              </div>

              {/* Bottom Record Button */}
              <div style={styles.cameraBottomBar}>
                {!isRecording ? (
                  <button style={styles.recordStartBtn} onClick={handleStartRecording}>
                    <div style={styles.recordStartInner} />
                  </button>
                ) : (
                  <button style={styles.recordStopBtn} onClick={handleStopRecording}>
                    <div style={styles.recordStopInner} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: VIDEO EDITOR */}
          {step === 'EDIT' && (
            <div style={styles.editorContainer}>
              {/* Left Column: Live Video Preview */}
              <div style={styles.previewBox}>
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <video
                    ref={previewVideoRef}
                    src={videoUrl || undefined}
                    loop
                    autoPlay
                    playsInline
                    style={{ ...styles.previewVideo, ...getFilterStyle() }}
                    onClick={togglePreviewPlay}
                  />
                  {overlayText && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '5%',
                        right: '5%',
                        textAlign: 'center',
                        ...(overlayPosition === 'top'
                          ? { top: '10%' }
                          : overlayPosition === 'center'
                          ? { top: '45%' }
                          : { bottom: '15%' }),
                        color: '#F59A18',
                        fontSize: 22,
                        fontWeight: '800',
                        textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 12px rgba(245, 154, 24, 0.6)',
                        pointerEvents: 'none'
                      }}
                    >
                      {overlayText}
                    </div>
                  )}

                  <button style={styles.playPauseOverlay} onClick={togglePreviewPlay}>
                    {isPlaying ? <Pause size={20} color="#FFF" /> : <Play size={20} color="#FFF" />}
                  </button>
                </div>
              </div>

              {/* Right Column: Editing Controls */}
              <div style={styles.controlsScroll}>
                {/* 1. Trimming */}
                <div style={styles.controlGroup}>
                  <label style={styles.controlLabel}>
                    <Scissors size={16} color="#F59A18" /> Trim Video ({trimStart.toFixed(1)}s - {trimEnd.toFixed(1)}s)
                  </label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span style={styles.miniLabel}>Start (s)</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, trimEnd - 0.5)}
                        step="0.1"
                        value={trimStart}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrimStart(val);
                          if (previewVideoRef.current) previewVideoRef.current.currentTime = val;
                        }}
                        style={styles.slider}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={styles.miniLabel}>End (s)</span>
                      <input
                        type="range"
                        min={trimStart + 0.5}
                        max={duration || 180}
                        step="0.1"
                        value={trimEnd}
                        onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                        style={styles.slider}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Cyberpunk Filters */}
                <div style={styles.controlGroup}>
                  <label style={styles.controlLabel}>
                    <Sparkles size={16} color="#F59A18" /> Cyber Visual Filter
                  </label>
                  <div style={styles.filterPills}>
                    {(['none', 'cyber_gold', 'dark_neon', 'cyber_mono', 'vivid_contrast'] as const).map(f => (
                      <button
                        key={f}
                        style={{
                          ...styles.pillBtn,
                          ...(selectedFilter === f ? styles.pillBtnActive : {})
                        }}
                        onClick={() => setSelectedFilter(f)}
                      >
                        {f === 'none' && 'Original'}
                        {f === 'cyber_gold' && '⚡ Cyber Gold'}
                        {f === 'dark_neon' && '🌌 Dark Neon'}
                        {f === 'cyber_mono' && '🖤 Cyber Mono'}
                        {f === 'vivid_contrast' && '✨ Vivid'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Playback Speed */}
                <div style={styles.controlGroup}>
                  <label style={styles.controlLabel}>
                    <Sliders size={16} color="#F59A18" /> Speed ({playbackSpeed}x)
                  </label>
                  <div style={styles.speedRow}>
                    {[0.5, 1.0, 1.25, 1.5, 2.0].map(s => (
                      <button
                        key={s}
                        style={{
                          ...styles.speedBtn,
                          ...(playbackSpeed === s ? styles.speedBtnActive : {})
                        }}
                        onClick={() => setPlaybackSpeed(s)}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Audio Volume */}
                <div style={styles.controlGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={styles.controlLabel}>
                      {volume === 0 ? <VolumeX size={16} color="#F59A18" /> : <Volume2 size={16} color="#F59A18" />}
                      Audio Volume ({Math.round(volume * 100)}%)
                    </label>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    style={styles.slider}
                  />
                </div>

                {/* 5. Text Overlay */}
                <div style={styles.controlGroup}>
                  <label style={styles.controlLabel}>
                    <Type size={16} color="#F59A18" /> Text Overlay
                  </label>
                  <input
                    type="text"
                    placeholder="Add catchy headline on reel..."
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                    style={styles.textInput}
                    maxLength={60}
                  />
                  {overlayText && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      {(['top', 'center', 'bottom'] as const).map(pos => (
                        <button
                          key={pos}
                          style={{
                            ...styles.posBtn,
                            ...(overlayPosition === pos ? styles.posBtnActive : {})
                          }}
                          onClick={() => setOverlayPosition(pos)}
                        >
                          {pos.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Cover Frame Time */}
                <div style={styles.controlGroup}>
                  <label style={styles.controlLabel}>
                    <ImageIcon size={16} color="#F59A18" /> Cover Snapshot Frame ({coverTime.toFixed(1)}s)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={duration || 15}
                    step="0.1"
                    value={coverTime}
                    onChange={(e) => setCoverTime(parseFloat(e.target.value))}
                    style={styles.slider}
                  />
                </div>

                {/* Next Step Button */}
                <button
                  style={styles.nextBtn}
                  onClick={() => setStep('PUBLISH_DETAILS')}
                >
                  <span>Continue to Publish</span>
                  <ArrowRight size={18} color="#000" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PUBLISH DETAILS */}
          {step === 'PUBLISH_DETAILS' && (
            <div style={styles.publishContainer}>
              <div style={styles.publishForm}>
                <div style={styles.formItem}>
                  <label style={styles.fieldLabel}>Caption & Description</label>
                  <textarea
                    placeholder="Write a caption for your Reel..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    style={styles.textarea}
                    rows={4}
                  />
                </div>

                <div style={styles.formItem}>
                  <label style={styles.fieldLabel}>Hashtags (comma separated)</label>
                  <input
                    type="text"
                    placeholder="jamsh, reels, vibe, cyberpunk"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    style={styles.textInput}
                  />
                </div>

                <div style={styles.formItem}>
                  <label style={styles.fieldLabel}>Audience & Visibility</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      style={{
                        ...styles.visibilityBtn,
                        ...(visibility === 'public' ? styles.visibilityBtnActive : {})
                      }}
                      onClick={() => setVisibility('public')}
                    >
                      🌍 Public
                    </button>
                    <button
                      style={{
                        ...styles.visibilityBtn,
                        ...(visibility === 'private' ? styles.visibilityBtnActive : {})
                      }}
                      onClick={() => setVisibility('private')}
                    >
                      🔒 Only Me / Private
                    </button>
                  </div>
                </div>

                <div style={{ ...styles.formItem, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={styles.fieldLabel}>Allow Comments</label>
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                    style={{ width: 20, height: 20, accentColor: '#F59A18' }}
                  />
                </div>

                <button style={styles.publishBtn} onClick={handlePublish}>
                  <span>Publish Reel 🚀</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: PROCESSING & UPLOAD PIPELINE */}
          {step === 'PROCESSING' && (
            <div style={styles.processingContainer}>
              {uploadProgress < 100 ? (
                <Loader2 size={64} color="#F59A18" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <CheckCircle size={64} color="#10B981" />
              )}
              <h3 style={styles.processTitle}>{processStatus}</h3>
              <div style={styles.progressBarBg}>
                <div style={{ ...styles.progressBarFill, width: `${uploadProgress}%` }} />
              </div>
              <span style={styles.progressPercent}>{uploadProgress}% Completed</span>
              {jobId && <span style={styles.jobIdText}>Worker Job ID: {jobId}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 880,
    maxHeight: '94dvh',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    backgroundColor: '#0A0A0A',
    borderRadius: 20,
    border: '1px solid rgba(245, 154, 24, 0.35)',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.9), 0 0 20px rgba(245, 154, 24, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    color: '#FFF',
    fontFamily: 'Manrope, sans-serif',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #1E1E1E',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
    color: '#FFF',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 6,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorAlert: {
    margin: '12px 24px 0',
    padding: '10px 14px',
    backgroundColor: 'rgba(237, 73, 86, 0.15)',
    border: '1px solid rgba(237, 73, 86, 0.4)',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: '#ED4956',
  },
  body: {
    padding: 24,
    overflowY: 'auto',
    flex: 1,
  },
  sourceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
    gap: 20,
    padding: '20px 0',
  },
  sourceCard: {
    backgroundColor: '#141414',
    border: '1px solid rgba(245, 154, 24, 0.25)',
    borderRadius: 18,
    padding: 28,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
    border: '1px solid rgba(245, 154, 24, 0.3)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 8px 0',
    color: '#FFF',
  },
  cardDesc: {
    fontSize: 13,
    color: '#A8A8A8',
    margin: '0 0 20px 0',
    lineHeight: '1.4',
  },
  cardAction: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F59A18',
  },
  cameraContainer: {
    position: 'relative',
    height: 520,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cameraTopBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  timerBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: '6px 14px',
    borderRadius: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ED4956',
  },
  recordDotActive: {
    animation: 'pulse 1s infinite',
  },
  flipBtn: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: '6px 14px',
    color: '#FFF',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  cameraBottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  recordStartBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    border: '4px solid #FFF',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  },
  recordStartInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ED4956',
  },
  recordStopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    border: '4px solid #FFF',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  },
  recordStopInner: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#ED4956',
  },
  editorContainer: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    minHeight: 380,
  },
  previewBox: {
    flex: '1 1 320px',
    maxWidth: '100%',
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 340,
    border: '1px solid #222',
  },
  previewVideo: {
    maxWidth: '100%',
    maxHeight: 480,
    objectFit: 'contain',
    borderRadius: 12,
  },
  playPauseOverlay: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 24,
    width: 40,
    height: 40,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  },
  controlsScroll: {
    flex: '1 1 320px',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxHeight: 520,
    overflowY: 'auto',
    paddingRight: 6,
  },
  controlGroup: {
    backgroundColor: '#141414',
    padding: 14,
    borderRadius: 12,
    border: '1px solid #222',
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#FFF',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  miniLabel: {
    fontSize: 11,
    color: '#A8A8A8',
    marginBottom: 4,
    display: 'block',
  },
  slider: {
    width: '100%',
    accentColor: '#F59A18',
    cursor: 'pointer',
  },
  filterPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  pillBtn: {
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    color: '#A8A8A8',
    borderRadius: 20,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  pillBtnActive: {
    backgroundColor: 'rgba(245, 154, 24, 0.2)',
    border: '1px solid #F59A18',
    color: '#F59A18',
  },
  speedRow: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  },
  speedBtn: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    color: '#A8A8A8',
    borderRadius: 8,
    padding: '8px 0',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  speedBtnActive: {
    backgroundColor: '#F59A18',
    color: '#000',
    borderColor: '#F59A18',
  },
  textInput: {
    width: '100%',
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#FFF',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  posBtn: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    border: '1px solid #333',
    color: '#A8A8A8',
    borderRadius: 6,
    padding: '6px 0',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  posBtnActive: {
    borderColor: '#F59A18',
    color: '#F59A18',
  },
  nextBtn: {
    backgroundColor: '#F59A18',
    color: '#000',
    border: 'none',
    borderRadius: 12,
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  publishContainer: {
    display: 'flex',
    justifyContent: 'center',
  },
  publishForm: {
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  formItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: '#FFF',
  },
  textarea: {
    width: '100%',
    backgroundColor: '#141414',
    border: '1px solid #333',
    borderRadius: 10,
    padding: 12,
    color: '#FFF',
    fontSize: 14,
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  visibilityBtn: {
    flex: 1,
    backgroundColor: '#141414',
    border: '1px solid #333',
    color: '#A8A8A8',
    borderRadius: 10,
    padding: '12px 0',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  visibilityBtnActive: {
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
    borderColor: '#F59A18',
    color: '#F59A18',
  },
  publishBtn: {
    backgroundColor: '#F59A18',
    color: '#000',
    border: 'none',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    marginTop: 12,
  },
  processingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 0',
    textAlign: 'center',
  },
  processTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: '20px 0 16px 0',
    color: '#FFF',
  },
  progressBarBg: {
    width: '80%',
    maxWidth: 400,
    height: 10,
    backgroundColor: '#222',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59A18',
    transition: 'width 0.3s ease',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F59A18',
  },
  jobIdText: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 8,
  },
};
