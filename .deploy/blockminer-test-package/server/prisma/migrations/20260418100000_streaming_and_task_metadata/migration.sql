-- Live streaming destinations (YouTube RTMP ingest + capture URL)
CREATE TABLE "stream_destinations" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "capture_url" TEXT NOT NULL,
    "rtmp_url" TEXT NOT NULL DEFAULT 'rtmp://a.rtmp.youtube.com/live2',
    "stream_key_enc" TEXT,
    "youtube_data_api_key_enc" TEXT,
    "video_width" INTEGER NOT NULL DEFAULT 1280,
    "video_height" INTEGER NOT NULL DEFAULT 720,
    "video_bitrate_k" INTEGER NOT NULL DEFAULT 2500,
    "audio_bitrate_k" INTEGER NOT NULL DEFAULT 128,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "desired_running" BOOLEAN NOT NULL DEFAULT false,
    "last_worker_status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "last_error" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "last_started_at" TIMESTAMP(3),
    "last_stopped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_destinations_pkey" PRIMARY KEY ("id")
);

-- Internal offerwall: optional structured task metadata (targeting, actions, external link)
ALTER TABLE "internal_offerwall_offers" ADD COLUMN "task_metadata" JSONB;
