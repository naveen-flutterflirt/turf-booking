const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const generatePresignedUrl = async (req, res) => {
  try {
    const { fileName, contentType, folder } = req.body;

    // Validations based on spec
    if (!fileName || !contentType || !folder) {
      return res.status(400).json({ success: false, message: 'Missing required fields: fileName, contentType, folder' });
    }

    const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedContentTypes.includes(contentType)) {
      return res.status(400).json({ success: false, message: 'Only JPEG, PNG and WebP images are allowed' });
    }

    const allowedFolders = ['turf-images', 'profile-images', 'turf-feedbacks'];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({ success: false, message: 'Invalid folder' });
    }

    const extension = path.extname(fileName) || (contentType === 'image/jpeg' ? '.jpg' : contentType === 'image/png' ? '.png' : '.webp');
    const uuid = uuidv4();
    const key = `${folder}/${uuid}${extension}`;
    const bucketName = process.env.AWS_S3_BUCKET || process.env.AWS_S3_AVATAR_BUCKET;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 }); // 10 minutes

    const region = process.env.AWS_REGION;
    const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    return res.status(200).json({
      success: true,
      data: {
        uploadUrl,
        fileUrl,
        key
      }
    });

  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate upload URL' });
  }
};

module.exports = {
  generatePresignedUrl
};
