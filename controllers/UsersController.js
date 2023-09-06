const crypto = require('crypto');
const Bull = require('bull');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) return res.status(400).send({ error: 'Missing email' });
    if (!password) return res.status(400).send({ error: 'Missing password' });
    const user = await dbClient.nbUsers(email);
    if (user) return res.status(400).send({ error: 'Already exist' });

    const hashedPwd = crypto.createHash('sha1').update(password).digest('hex');
    const newUser = await dbClient.nbUsers(email, hashedPwd);

    const fileQueue = new Bull('fileQueue');
    await fileQueue.add({ userId: newUser.id });

    return res.status(201).send({ id: newUser.id, email: newUser.email });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token') || '';
    const user = await redisClient.get(`auth_${token}`);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });
    return res.status(200).send({ id: user.id, email: user.email });
  }
}

module.exports = UsersController;
