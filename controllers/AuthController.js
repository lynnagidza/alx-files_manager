const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

class AuthController {
  static async getConnect(req, res) {
    const auth = req.header('Authorization') || '';
    const buff = Buffer.from(auth.replace('Basic ', ''), 'base64');
    const credentials = {
      email: buff.toString('utf-8').split(':')[0],
      password: buff.toString('utf-8').split(':')[1],
    };

    const hashedPwd = crypto.createHash('sha1').update(credentials.password).digest('hex');
    const user = await dbClient.nbUsers(credentials.email);

    if (!user) return res.status(401).send({ error: 'Unauthorized' });
    if (user.password !== hashedPwd) return res.status(401).send({ error: 'Unauthorized' });

    const token = uuidv4();
    const key = `auth_${token}`;
    await redisClient.set(key, user._id.toString(), 86400);
    return res.status(200).send({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.header('X-Token') || '';
    const key = `auth_${token}`;
    const user = await redisClient.get(key);

    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    await redisClient.del(key);
    return res.status(204).send();
  }
}

module.exports = AuthController;
