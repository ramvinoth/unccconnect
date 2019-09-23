'use strict';
console.log('Config in development');
module.exports = {
  REQUESTS_DELAY: 0,
  IMG_STATIC: 'http://www.tamizhans.in',
  IMG_STATIC_URL: 'http://www.tamizhans.in/image.php',
  REQUESTS_DELAY_SYSTEM: 0,
  baseURL: 'http://localhost:8181',
  db: process.env.MONGOHQ_URL || 'mongodb://' + (process.env.DB_PORT_27017_TCP_ADDR || 'localhost') + '/trippycuisiners',
  server: {
    host: 'localhost',
    port: '8181'
  },
  secret: 'trippycuisinerssecret',
  settings: {
  	perPage: 10,
  	email: {
  		service: 'thaco.websitewelcome.com'
  	}
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  FACEBOOK_SECRET: 'bb0908d09db0197a9988152a322e41a4',
  NEWRELIC_LICENCE_KEY: '9ce3a29fe56a6dbe4fdf7a0c2f45662604fcc477',
};
