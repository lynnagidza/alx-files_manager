const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Bull = require('bull');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token') || '';
    const user = await redisClient.get(`auth_${token}`);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const {
      name, type, parentID, isPublic, data,
    } = req.body;

    if (!name) return res.status(400).send({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) return res.status(400).send({ error: 'Missing type' });
    if (!data && ['file', 'image'].includes(type)) return res.status(400).send({ error: 'Missing data' });

    const parent = await dbClient.nbFiles({ id: parentID });
    if (!parent && parentID !== 0) return res.status(400).send({ error: 'Parent not found' });
    if (parent && parent.type !== 'folder') return res.status(400).send({ error: 'Parent is not a folder' });

    if (type === 'folder') {
      const folder = {
        userID: user.id,
        name,
        type,
        isPublic: isPublic || false,
        parentID: parentID || 0,
      };

      const result = await dbClient.insertFile(folder);
      return res.status(201).send(result);
    }

    let localPath = '';
    const storingFolderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    localPath = path.join(storingFolderPath, uuidv4());
    if (!fs.existsSync(storingFolderPath)) fs.mkdirSync(storingFolderPath, { recursive: true });

    const buff = Buffer.from(data, 'base64');
    fs.writeFileSync(localPath, buff);

    const file = {
      userID: user.id,
      name,
      type,
      isPublic: isPublic || false,
      parentID: parentID || 0,
      localPath,
    };

    const result = await dbClient.insertFile(file);
    const fileQueue = new Bull('fileQueue');
    await fileQueue.add({ fileId: result.id, userId: user.id });
    return res.status(201).send(result);
  }

  static async getShow(req, res) {
    const token = req.header('X-Token') || '';
    const user = await redisClient.get(`auth_${token}`);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const { id } = req.params;
    const file = await dbClient.nbFiles({ id });
    if (!file) return res.status(404).send({ error: 'Not found' });
    if (file.isPublic === false && file.userID !== user.id) return res.status(403).send({ error: 'Forbidden' });

    return res.status(200).send(file);
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token') || '';
    const user = await redisClient.get(`auth_${token}`);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const { parentId } = req.query;
    const parent = await dbClient.nbFiles({ id: parentId });
    if (!parent && parentId !== 0) return res.status(200).send([]);
    if (parent && parent.type !== 'folder') return res.status(200).send([]);

    const files = await dbClient.nbFiles({ parentId });
    if (!files) return res.status(200).send([]);

    if (parent && parent.isPublic === false && parent.userID !== user.id) return res.status(403).send({ error: 'Forbidden' });

    return res.status(200).send(files);
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token') || '';
    const user = await redisClient.get(`auth_${token}`);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const { id } = req.params;
    const file = await dbClient.nbFiles({ id });
    if (!file) return res.status(404).send({ error: 'Not found' });
    if (file.userID !== user.id) return res.status(403).send({ error: 'Forbidden' });

    const result = await dbClient.updateFile(id, { isPublic: true });
    return res.status(200).send(result);
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token') || '';
    const user = await redisClient.get(`auth_${token}`);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const { id } = req.params;
    const file = await dbClient.nbFiles({ id });
    if (!file) return res.status(404).send({ error: 'Not found' });
    if (file.userID !== user.id) return res.status(403).send({ error: 'Forbidden' });

    const result = await dbClient.updateFile(id, { isPublic: false });
    return res.status(200).send(result);
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const file = await dbClient.nbFiles({ id });
    if (!file) return res.status(404).send({ error: 'Not found' });
    if (file.type !== 'file' && file.type !== 'image') return res.status(404).send({ error: 'Not found' });

    const token = req.header('X-Token') || '';
    const user = await redisClient.get(`auth_${token}`);
    if (!file.isPublic && !user) return res.status(404).send({ error: 'Not found' });
    if (!file.isPublic && file.userID !== user.id) return res.status(404).send({ error: 'Not found' });

    const fileData = fs.readFileSync(file.localPath);
    const fileData64 = fileData.toString('base64');

    const fileSizes = ['500', '250', '100'];
    if (file.type === 'image') {
      const filePromises = fileSizes.map(async (size) => {
        const thumbnailData = fs.readFileSync(`${file.localPath}_${size}`);
        const thumbnailData64 = thumbnailData.toString('base64');
        return thumbnailData64;
      });
      const thumbnails = await Promise.all(filePromises);
      return res.status(200).send({
        name: file.name, type: file.type, data: fileData64, thumbnails,
      });
    }

    return res.status(200).send({ name: file.name, type: file.type, data: fileData64 });
  }
}

module.exports = FilesController;
