const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const redis = require('redis');


const User = require('./models/user');
const Post  = require('./models/post');

const app = express();
app.use(express.static('static'));
app.use(express.json());

const port = 3000;

mongoose.connect('mongodb://127.0.0.1:27017/jsonplaceholder');


const redisConf = {
  host: 'localhost',
  port: 6379,
  pass:''
}

const client = redis.createClient(redisConf);


function cacheData(req, data) {
  const key = req.originalUrl;
  client.setex(key, 3600, JSON.stringify(data)); 
}


async function checkCacheAndDatabase(req, res, next) {
  const key = req.originalUrl;


  client.get(key, async (err, data) => {
    if (err) throw err;

    if (data !== null) {
      console.log('Données récupérées depuis le cache Redis.');
      res.send(JSON.parse(data));
    } else {
      try {
        console.log('Données non trouvées dans le cache. Vérification de la base de données MongoDB.');
        let mongodbData = await Post.find().populate('comments').lean();

        if (mongodbData.length === 0) {
          const usersResponse = await axios.get('https://jsonplaceholder.typicode.com/users');
          const postsResponse = await axios.get('https://jsonplaceholder.typicode.com/posts');
          const commentsResponse = await axios.get('https://jsonplaceholder.typicode.com/comments');

         
          await User.insertMany(usersResponse.data);

         
          const postsWithComments = postsResponse.data.map(post => {
            post.comments = commentsResponse.data.filter(comment => comment.postId === post.id);
            return post;
          });

          await Post.insertMany(postsWithComments);

         
          mongodbData = await Post.find().populate('comments').lean();
          console.log('Données insérées dans la base de données MongoDB.');
        }

        
        cacheData(req, mongodbData);
        console.log('Données mises en cache dans Redis.');

        res.json(mongodbData);
      } catch (error) {
        console.error(error);
        res.status(500).send('Erreur lors de la récupération des données depuis MongoDB.');
      }
    }
  });
}

app.get('/data', checkCacheAndDatabase);



app.listen(port, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${port}`);
});
