"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
// Set path to FFmpeg binary
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_1.default.path);
dotenv.config();
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czxoschackeetzspupxh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Initialize client with high-privileged Service Role key to override RLS on ingest queues
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        persistSession: false
    }
});
const INGEST_BUCKET = 'reels-ingest';
const PLAY_BUCKET = 'reels-stream';
const TMP_DIR = path.join(__dirname, '../tmp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}
// 1. Worker loop
async function startWorker() {
    console.log('[MediaWorker] Starting processing queue scanner...');
    while (true) {
        try {
            if (!SUPABASE_SERVICE_ROLE_KEY) {
                console.log('[MediaWorker] No service role key config. Simulating local polling worker in mock mode...');
                await sleep(5000);
                continue;
            }
            // Claim job atomically
            const { data: job, error } = await supabase.rpc('claim_next_media_job', {
                p_worker_id: 'worker-1'
            });
            if (error) {
                console.error('[MediaWorker] Error fetching jobs:', error.message);
                await sleep(5000);
                continue;
            }
            if (!job || job.length === 0) {
                // No jobs available
                await sleep(3000);
                continue;
            }
            const activeJob = job[0];
            console.log(`[MediaWorker] Processing Job ID: ${activeJob.id} for user ${activeJob.user_id}`);
            await processMediaJob(activeJob);
        }
        catch (err) {
            console.error('[MediaWorker] Unexpected loop error:', err.message);
            await sleep(5000);
        }
    }
}
// Helper to sleep
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// 2. Transcode & Moderation worker logic
async function processMediaJob(job) {
    const localRawPath = path.join(TMP_DIR, `${job.id}_raw.mp4`);
    const localOutDir = path.join(TMP_DIR, `${job.id}_hls`);
    const localThumbPath = path.join(TMP_DIR, `${job.id}_thumb.webp`);
    if (!fs.existsSync(localOutDir)) {
        fs.mkdirSync(localOutDir, { recursive: true });
    }
    try {
        // 1. Download raw file from Supabase storage
        console.log(`[MediaWorker] Downloading raw file: ${job.raw_video_path}`);
        const { data: fileData, error: dlError } = await supabase.storage
            .from(INGEST_BUCKET)
            .download(job.raw_video_path);
        if (dlError || !fileData) {
            throw new Error(`Failed downloading ingest file: ${dlError?.message || 'Empty file data'}`);
        }
        const buffer = Buffer.from(await fileData.arrayBuffer());
        fs.writeFileSync(localRawPath, buffer);
        // 2. Parse metadata (Duration, Resolution)
        console.log('[MediaWorker] Probing video file...');
        const meta = await getMetadata(localRawPath);
        console.log(`[MediaWorker] Video metadata: Duration: ${meta.duration}s, Resolution: ${meta.width}x${meta.height}`);
        if (meta.duration > 180) {
            throw new Error('Video duration exceeds maximum allowed Reels length of 3 minutes');
        }
        // 3. AI Moderation Check (Keyword filtering as mock safety engine)
        console.log('[MediaWorker] Executing content moderation checks...');
        const moderationStatus = runModerationSafety(job.metadata?.caption || '');
        if (moderationStatus === 'rejected') {
            throw new Error('Video metadata flagged by content moderation safety engine.');
        }
        // 4. Generate WebP Thumbnail
        console.log('[MediaWorker] Generating thumbnail frame...');
        await generateThumbnail(localRawPath, localThumbPath);
        // 5. Transcode to multi-resolution HLS stream (360p, 480p, 720p, 1080p stubs)
        console.log('[MediaWorker] Transcoding video to HLS Adaptive Bitrate Stream...');
        await runHlsTranscode(localRawPath, localOutDir);
        // 6. Upload output segments back to Storage
        const streamFolder = `reels/${job.user_id}/${job.id}`;
        const hlsFiles = fs.readdirSync(localOutDir);
        console.log(`[MediaWorker] Uploading HLS segments (${hlsFiles.length} files)...`);
        for (const file of hlsFiles) {
            const filePath = path.join(localOutDir, file);
            const fileStream = fs.readFileSync(filePath);
            const { error: ulError } = await supabase.storage
                .from(PLAY_BUCKET)
                .upload(`${streamFolder}/${file}`, fileStream, {
                contentType: file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T',
                upsert: true
            });
            if (ulError)
                throw new Error(`Segment upload failed: ${ulError.message}`);
        }
        // Upload Thumbnail
        const thumbStream = fs.readFileSync(localThumbPath);
        const { error: thumbUlError } = await supabase.storage
            .from(PLAY_BUCKET)
            .upload(`${streamFolder}/thumbnail.webp`, thumbStream, {
            contentType: 'image/webp',
            upsert: true
        });
        if (thumbUlError)
            throw new Error(`Thumbnail upload failed: ${thumbUlError.message}`);
        // Get public URL paths
        const videoUrl = `${SUPABASE_URL}/storage/v1/object/public/${PLAY_BUCKET}/${streamFolder}/index.m3u8`;
        const thumbnailUrl = `${SUPABASE_URL}/storage/v1/object/public/${PLAY_BUCKET}/${streamFolder}/thumbnail.webp`;
        // 7. Insert/Update Video row in database
        console.log('[MediaWorker] Publishing video metadata into database...');
        const { data: videoRecord, error: insertError } = await supabase
            .from('videos')
            .insert({
            id: job.video_id || undefined,
            user_id: job.user_id,
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl,
            caption: job.metadata?.caption || '',
            hashtags: job.metadata?.hashtags || [],
            interests: job.metadata?.interests || [],
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            visibility: job.metadata?.visibility || 'public',
            moderation_status: moderationStatus
        })
            .select()
            .single();
        if (insertError)
            throw new Error(`Video insert failed: ${insertError.message}`);
        // Update job status to completed
        await supabase
            .from('media_jobs')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', job.id);
        console.log(`[MediaWorker] Job ${job.id} completed successfully! Published video ID: ${videoRecord.id}`);
    }
    catch (err) {
        console.error(`[MediaWorker] Job ${job.id} failed:`, err.message);
        // Update attempts and fail status
        await supabase
            .from('media_jobs')
            .update({
            status: job.attempts + 1 >= job.max_attempts ? 'failed' : 'queued',
            attempts: job.attempts + 1,
            error_log: err.message,
            updated_at: new Date().toISOString()
        })
            .eq('id', job.id);
    }
    finally {
        // Cleanup temporary files
        try {
            if (fs.existsSync(localRawPath))
                fs.unlinkSync(localRawPath);
            if (fs.existsSync(localThumbPath))
                fs.unlinkSync(localThumbPath);
            if (fs.existsSync(localOutDir)) {
                fs.rmSync(localOutDir, { recursive: true, force: true });
            }
        }
        catch (e) {
            console.warn('[MediaWorker] Temp cleanup warning:', e);
        }
    }
}
// 3. Probing Helpers
function getMetadata(videoPath) {
    return new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(videoPath, (err, metadata) => {
            if (err)
                return reject(err);
            const stream = metadata.streams.find((s) => s.codec_type === 'video');
            resolve({
                duration: metadata.format.duration || 0,
                width: stream?.width || 1080,
                height: stream?.height || 1920
            });
        });
    });
}
// 4. Thumbnail WebP generator helper
function generateThumbnail(videoPath, outPath) {
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(videoPath)
            .screenshots({
            timestamps: ['2'],
            filename: path.basename(outPath),
            folder: path.dirname(outPath)
        })
            .on('end', () => {
            // Convert to WebP using ffmpeg if screenshot is generic image
            resolve();
        })
            .on('error', (err) => reject(err));
    });
}
// 5. HLS Transcoding helper
function runHlsTranscode(videoPath, outDir) {
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(videoPath)
            .output(path.join(outDir, 'index.m3u8'))
            .outputOptions([
            '-profile:v baseline',
            '-level 3.0',
            '-start_number 0',
            '-hls_time 6',
            '-hls_list_size 0',
            '-f hls'
        ])
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });
}
// 6. Moderation Stubs
function runModerationSafety(caption) {
    const blockedWords = ['nudity', 'violence', 'gore', 'hatesymbol', 'unsafe'];
    const normalized = caption.toLowerCase();
    for (const word of blockedWords) {
        if (normalized.includes(word))
            return 'rejected';
    }
    return 'approved';
}
startWorker();
