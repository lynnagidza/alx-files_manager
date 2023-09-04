const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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
    return res.status(201).send(result);
  }
}

module.exports = FilesController;
