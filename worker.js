const Queue = require('bull');
const thumbnail = require('image-thumbnail');
const { MongoClient } = require('mongodb');
const fs = require('fs');

const mongoClient = new MongoClient('mongodb://localhost:27017', { useNewUrlParser: true, useUnifiedTopology: true });

const fileQueue = new Queue('fileQueue', {
  redis: {
    port: 6379,
    host: 'localhost',
  },
});

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  await mongoClient.connect();
  const db = mongoClient.db('files_manager');

  const document = await db.collection('files').findOne({ fileId, userId });

  await mongoClient.close();

  if (!document) {
    throw new Error('File not found');
  }

  const thumbnailSizes = [500, 250, 100];

  const thumbnailPromises = thumbnailSizes.map(async (size) => {
    const thumbnailData = await thumbnail(document.filePath, { width: size });
    const thumbnailFileName = `${document.filePath}_${size}`;

    fs.writeFileSync(thumbnailFileName, thumbnailData);

    return thumbnailFileName;
  });

  const thumbnails = await Promise.all(thumbnailPromises);

  return thumbnails;
});

fileQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

fileQueue.process();
