-- CreateTable
CREATE TABLE "TgUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "languageCode" TEXT NOT NULL DEFAULT 'ru',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "freeCredits" INTEGER NOT NULL DEFAULT 3,
    "referralCode" TEXT NOT NULL,
    "referredById" INTEGER,
    "acquisitionSource" TEXT,
    "acquisitionMedium" TEXT,
    "acquisitionCampaign" TEXT,
    "acquisitionContent" TEXT,
    "acquisitionTerm" TEXT,
    "acquisitionStartParam" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TgUser_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "TgUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "plan" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressStage" TEXT,
    "progressMessage" TEXT,
    "selectedSongId" INTEGER,
    "recipientName" TEXT NOT NULL,
    "recipientPronunciation" TEXT,
    "trackTitle" TEXT,
    "occasion" TEXT NOT NULL,
    "userText" TEXT NOT NULL,
    "enhancedLyrics" TEXT,
    "approvedLyrics" TEXT,
    "lyricsApprovedAt" DATETIME,
    "draftId" TEXT,
    "genre" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "voiceType" TEXT,
    "voiceProfileId" INTEGER,
    "style" TEXT,
    "tempo" TEXT NOT NULL DEFAULT 'medium',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "generationModel" TEXT,
    "generationSettings" TEXT,
    "addCover" BOOLEAN NOT NULL DEFAULT false,
    "addVideo" BOOLEAN NOT NULL DEFAULT false,
    "videoStyle" TEXT,
    "videoPhotoTokens" TEXT,
    "giftPhotoToken" TEXT,
    "addSpokenIntro" BOOLEAN NOT NULL DEFAULT false,
    "spokenIntroToken" TEXT,
    "coverUrl" TEXT,
    "videoUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "paymentId" TEXT,
    "paymentSource" TEXT,
    "paidAt" DATETIME,
    "sunoJobId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "hiddenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TgUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_voiceProfileId_fkey" FOREIGN KEY ("voiceProfileId") REFERENCES "VoiceProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Song" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shareToken" TEXT,
    "orderId" INTEGER NOT NULL,
    "sunoId" TEXT NOT NULL,
    "sunoTaskId" TEXT,
    "title" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "providerAudioUrl" TEXT,
    "providerImageUrl" TEXT,
    "wavUrl" TEXT,
    "vocalUrl" TEXT,
    "instrumentalUrl" TEXT,
    "duration" INTEGER,
    "fileId" TEXT,
    "model" TEXT,
    "stylePrompt" TEXT,
    "negativeTags" TEXT,
    "lyricsJson" TEXT,
    "waveformJson" TEXT,
    "qualityScore" REAL,
    "variantIndex" INTEGER NOT NULL DEFAULT 0,
    "candidateIndex" INTEGER NOT NULL DEFAULT 0,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Song_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SongDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'gift',
    "briefJson" TEXT NOT NULL,
    "lyrics" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stylePrompt" TEXT NOT NULL,
    "negativeTags" TEXT,
    "pronunciationJson" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SongDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TgUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "sourceMediaToken" TEXT,
    "verificationMediaToken" TEXT,
    "validationTaskId" TEXT,
    "validationPhrase" TEXT,
    "voiceTaskId" TEXT,
    "voiceId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "style" TEXT,
    "singerSkillLevel" TEXT NOT NULL DEFAULT 'intermediate',
    "consentAt" DATETIME NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TgUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SongAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "songId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inputJson" TEXT NOT NULL,
    "providerTaskId" TEXT,
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SongAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TgUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SongAction_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER,
    "event" TEXT NOT NULL,
    "path" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "startParam" TEXT,
    "referrer" TEXT,
    "shareToken" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TgUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SunoTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" INTEGER,
    "actionId" INTEGER,
    "voiceProfileId" INTEGER,
    "variantIndex" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "callbackType" TEXT,
    "responseJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "userId" INTEGER,
    "kind" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TgUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "orderId" INTEGER,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TgUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TgUser_telegramId_key" ON "TgUser"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "TgUser_referralCode_key" ON "TgUser"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Song_shareToken_key" ON "Song"("shareToken");

-- CreateIndex
CREATE INDEX "SongDraft_userId_createdAt_idx" ON "SongDraft"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceProfile_voiceId_key" ON "VoiceProfile"("voiceId");

-- CreateIndex
CREATE INDEX "VoiceProfile_userId_status_idx" ON "VoiceProfile"("userId", "status");

-- CreateIndex
CREATE INDEX "SongAction_userId_createdAt_idx" ON "SongAction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SongAction_songId_type_idx" ON "SongAction"("songId", "type");

-- CreateIndex
CREATE INDEX "MarketingEvent_userId_createdAt_idx" ON "MarketingEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_event_createdAt_idx" ON "MarketingEvent"("event", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_source_campaign_idx" ON "MarketingEvent"("source", "campaign");

-- CreateIndex
CREATE UNIQUE INDEX "SunoTask_taskId_key" ON "SunoTask"("taskId");

-- CreateIndex
CREATE INDEX "SunoTask_orderId_status_idx" ON "SunoTask"("orderId", "status");

-- CreateIndex
CREATE INDEX "SunoTask_actionId_status_idx" ON "SunoTask"("actionId", "status");

-- CreateIndex
CREATE INDEX "SunoTask_voiceProfileId_status_idx" ON "SunoTask"("voiceProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_token_key" ON "MediaAsset"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storagePath_key" ON "MediaAsset"("storagePath");

-- CreateIndex
CREATE INDEX "MediaAsset_userId_kind_idx" ON "MediaAsset"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");

