var mongoose = require('mongoose');
var User = mongoose.model('User');
var Stream = mongoose.model('Stream');
var jwt = require('jsonwebtoken');

module.exports = function(System) {
  var obj = {};
  var json = System.plugins.JSON;
  var event = System.plugins.event;

  var sck = System.webSocket;

  sck.on('connection', function(socket){
    /**
     * Clear the users socket id
     */
    var clearSocket = function(data) {
      User.findOne({_id: socket.userId}, function(err, user) {
        if (user) {
          delete socket.userId;
          user.socketId = '';
          user.loggedIn = false;
          user.save(function(err) {
            console.log(user.name, 'disconnected.');
          });
        }
      });
    };
    
    socket.on('online', function(data) {
      User.findOne({token: data.token}, function(err, user) {
        if (user) {
          socket.userId = user._id;
          user.socketId = socket.id;
          user.loggedIn = true;
          user.save(function(err) {
            console.log(user.name, 'is online.');
          });
        }
      });
    });
    
    socket.on('disconnect', clearSocket);
    socket.on('logout', clearSocket);

  });

  /**
   * Event based notifications
   */
  ['follow'].map(function(action) {
    event.on(action, function(data) {
      var user = data.user;
      var actor = data.actor;
      user.notify({
        userId: user._id,
        actorId: actor._id,
        notificationType: action
      }, System);
    });
  });

  /**
   * Create / register a new user
   * @param  {Object} req Request
   * @param  {Object} res Request
   * @return {Void}     
   */
  obj.create = function(req, res, socialUser) {
    /**
     * The roles for the new user
     * @type {Array}
     */
    var roles = ['authenticated'];

    /**
     * Status of the user account
     * @type {Boolean}
     */
    var active = false;

    /**
     * Check if this is the first user
     */
    User.count({}, function(err, len) {
      /**
       * If so, should be admin
       */
      if (!len) {
        roles.push('admin');
        active = true;
      }else{
        roles.push('user');
      }

      /**
       * Check if user's email matches the global domain settings
       * @type {Boolean}
       */
      var isValidEmail = false;

      /**
       * Get the users email
       * @type {String}
       */
      var email = req.body.email;

      /**
       * Get comma separated domains from settings
       * @type {String}
       */
      var domains = System.settings.domains;
      //No need to check domain now
      domains = false;
      
      if (domains) {
        /**
         * Convert to array
         * @type {Array}
         */
        domains = domains.split(',');

        /**
         * Loop through all and check if it matches any one
         */
        domains.map(function(domain) {
          domain = domain.trim();
          var valid = new RegExp(domain + '$', 'i');
          if (valid.test(email)) {
            isValidEmail = true;
          }
        });
      } else {
        /**
         * Probably the first user of the system, allow to register
         * @type {Boolean}
         */
        isValidEmail = true;
      }

      /**
       * So if invalid email, return a friendly message
       */
      if (!isValidEmail) {
        return json.unhappy({message: 'Invalid email. Remember to use your team address.'}, res);
      }
      

      /**
       * Add the user
       */
      var user = new User(req.body);
      user.provider = 'local';
      user.roles = roles;
      user.token = jwt.sign({data: user}, System.config.secret, {
        expiresIn: 604800 // 1 week
      });
      user.active = active;

      if(socialUser){
        user.facebook = socialUser.facebook; 
        user.face = socialUser.face;
        user.picture = socialUser.face;
        user.name = socialUser.name;
        var random_val = Math.floor(1000 + Math.random() * 9000);
        user.username = socialUser.name.replace(' ', '').toLowerCase()+"_"+random_val;
      }

      user.save(function(err, user) {
        if (err) {
          return json.unhappy(err, res);
        }

        if (!user.active) {
          /**
           * Send activation email
           */
          System.plugins.emailing.generate({
            name: user.name,
            message: 'Welcome! In order to continue using the platform, you will need to activate your account by clicking the below link:',
            action: 'Activate My Account',
            subject: 'Actiate Your Account',
            href: System.config.baseURL + '/activate/' + user._id + '/' + escape(user.activationCode)
          }, function(html) {
            var data = {
              actor: {
                name: 'Activation'
              }
            };
            data.html = html;
            System.plugins.notifications.sendByEmail(user, data);

            try{
              if(user.streams.length < 3){
                var streamArr = []
                Stream.find({}, function(err, streams){
                  streams.forEach(function(stream){
                    streamArr.push(stream._id);
                  });
                  user.streams = streamArr;
                  user.save(function(err) {
                    if (err) {
                      console.log("Error in stream update on login : ",err);
                    }else{
                      console.log("Stream update successfull on login : ");
                    }
                  });
                })
              }
            }catch(ex){
              console.log("Exception in subscribing streams to user on new login", ex);
            }
            //return json.happy(user, res);
            return json.happy({
              record: user,
              token: user.token
            }, res);
          });
        } else {
          return json.happy({
            record: user,
            token: user.token
          }, res);
        }

      });

    });
  };

  /**
   * Modify an existing user
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.modify = function (req, res) {
    var user = req.user;
    var restrictedNames = ['Admin', 'admin', 'Moderator', 'moderator', 'Tamizhan', 'tamizhan'];
    if(restrictedNames.indexOf(req.body.name) > -1){
      return json.unhappy({message : "The given username is restricted. Please try someother name"}, res);
    }
    user.name = req.body.name;
    user.designation = req.body.designation;
    if (req.body.password) {
      user.password = req.body.password;
    }
    user.save(function(err) {
      if (err) {
        return json.unhappy(err, res);
      }
      return json.happy(user, res);
    });
  };
  
  /**
   * Check if the user credentials are valid
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}
   */
  obj.authenticate = function(req, res) {
    if (req.body.activationCode) {
      User.findOne({activationCode: req.body.activationCode, _id: req.body.userId}, function(err, user) {
        if (err) {
          json.unhappy(err, res);
        } else {
          if (user) {
            user.active = true;
            user.save(function(err, user) {
              json.happy({
                record: user,
                token: user.token
              }, res);
            })
          } else {
            json.unhappy({
              message: 'Incorrect Auth Link'
            }, res);
          }
        }
      });
    } else {
      User.findOne({email: req.body.email}, function(err, user) {
        if (err) {
          json.unhappy(err, res);
        } else {
          //user.active check is disabled for time being.
          if (user && user.hashPassword(req.body.password) === user.hashed_password /*&& user.active*/) {
            json.happy({
              record: user,
              token: user.token
            }, res);
            try{
              if(user.streams.length < 3){
                var streamArr = []
                Stream.find({}, function(err, streams){
                  streams.forEach(function(stream){
                    streamArr.push(stream._id);
                  });
                  user.streams = streamArr;
                  user.save(function(err) {
                    if (err) {
                      console.log("Error in stream update on login : ",err);
                    }else{
                      console.log("Stream update successfull on login : ");
                    }
                  });
                })
              }
            }catch(ex){
              console.log("Exception in subscribing streams to user on new login", ex);
            }
          } else {
            json.unhappy({
              message: 'Incorrect email/password'
            }, res);
          }
        }
      });
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Login with Facebook
  |--------------------------------------------------------------------------
  */
  function createJWT(user){
    var token = jwt.sign({data: user}, System.config.secret, {
      expiresIn: 604800 // 1 week
    });
    return token;
  }

  obj.social = function(req, res){
    var request = require('request');
    var config = System.config;
    var fields = ['id', 'email', 'first_name', 'last_name', 'link', 'name'];
    var accessTokenUrl = 'https://graph.facebook.com/v2.5/oauth/access_token';
    var graphApiUrl = 'https://graph.facebook.com/v2.5/me?fields=' + fields.join(',');
    var params = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.FACEBOOK_SECRET,
      redirect_uri: req.body.redirectUri
    };

    // Step 1. Exchange authorization code for access token.
    request.get({ url: accessTokenUrl, qs: params, json: true }, function(err, response, accessToken) {
      if (response.statusCode !== 200) {
        return res.status(500).send({ message: accessToken.error.message });
      }

      // Step 2. Retrieve profile information about the current user.
      request.get({ url: graphApiUrl, qs: accessToken, json: true }, function(err, response, profile) {
        if (response.statusCode !== 200) {
          return res.status(500).send({ message: profile.error.message });
        }
        if (req.header('Authorization')) {
          User.findOne({ facebook: profile.id }, function(err, existingUser) {
            if (existingUser) {
              return json.happy({
                record: existingUser,
                token: existingUser.token
              }, res);
              //return res.status(409).send({ message: 'There is already a Facebook account that belongs to you' });
            }
            var token = req.header('Authorization').split(' ')[1];
            var payload = jwt.decode(token, config.secret);
            var query = { email: profile.email };
            if(token != "null"){
              query = { _id: payload.sub };
            }
            User.findOne(query, function(err, user) {
              if (!user) {
                // Step 3. Create a new user account or return an existing one.
                if (existingUser) {
                  var token = createJWT(existingUser);
                  return res.send({ token: token });
                }
                var user = new User();
                req.body.email = profile.email;
                user.email = profile.email;
                user.facebook = profile.id;
                user.face = 'https://graph.facebook.com/' + profile.id + '/picture?type=large';
                user.name = profile.name;
                obj.create(req, res, user);
              }else{
                user.facebook = profile.id;
                user.face = user.face || 'https://graph.facebook.com/v2.3/' + profile.id + '/picture?type=large';
                user.name = user.name || profile.name;
                user.save(function() {
                  var token = createJWT(user);
                  json.happy({
                    record: user,
                    token: user.token
                  }, res);
                });
              }
            });
          });
        } else {
          
        }
      });
    });
  }

  /**
   * List all users
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.list = function(req, res) {
    //TODO: pagination
    User.find({}, function(err, users) {
      if (err) {
        json.unhappy(err, res);
      } else {
        json.happy({
          records: users
        }, res);
      }
    });
  };

  /**
   * Send activation email to a specific user
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.activate = function(req, res) {
    var userId = req.params.userId;
    User.findOne({_id: userId}, function(err, user) {
      if (err || !user) {

      } else {
        /**
         * Send activation email
         */
        System.plugins.emailing.generate({
          name: user.name,
          message: 'Welcome! In order to continue using the platform, you will need to activate your account by clicking the below link:',
          action: 'Activate My Account',
          subject: 'Actiate Your Account',
          href: System.config.baseURL + '/activate/' + user._id + '/' + escape(user.activationCode)
        }, function(html) {
          var data = {
            actor: {
              name: 'Activation'
            }
          };
          data.html = html;
          System.plugins.notifications.sendByEmail(user, data);
          return json.happy(user, res);
        });
      }
    });
  };

  /**
   * Send reset email to a specific user
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.resetPassword = function(req, res) {
    var email = req.query.email;
    User.findOne({email: email}, function(err, user) {
      if (err || !user) {

      } else {
        /**
         * Send activation email
         */
        System.plugins.emailing.generate({
          name: user.name,
          message: 'We received a password reset request for your account. If you would like to continue, please click the below button:',
          action: 'Reset My Password',
          subject: 'Reset Your Password',
          href: System.config.baseURL + '/changePassword/' + user._id + '/' + escape(user.activationCode)
        }, function(html) {
          var data = {
            actor: {
              name: 'Help'
            }
          };
          data.html = html;
          System.plugins.notifications.sendByEmail(user, data);
          return json.happy(user, res);
        });
      }
    });
  };

  /**
   * Send invite email to a specific email
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.invite = function(req, res) {
    var userId = req.params.userId;
    User.findOne({_id: userId}, function(err, user) {
      if (err || !user) {

      } else {
        /**
         * Send activation email
         */
        System.plugins.emailing.generate({
          name: req.body.name,
          message: 'You have received an invite from ' + user.name + '!' + (req.body.message ? ' Below is what they said:' : ''),
          message2: req.body.message,
          action: 'Join Now!',
          subject: 'Invitation from ' + user.name,
          href: System.config.baseURL + '/login'
        }, function(html) {
          var data = {
            actor: user
          };
          data.html = html;
          data.to = req.body.email;
          System.plugins.notifications.sendByEmail(user, data);
          return json.happy(user, res);
        });
      }
    });
  };

  /**
   * Follow a user not already following
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.follow = function(req, res) {
    var currUser = req.user;
    var toFollow = req.param('userId');
    
    var already = req.user.following.filter(function(item) {
      return item.username === toFollow;
    }).length;
    if (already) {
      return json.unhappy('You are already following', res);
    }

    User.findOne({username: toFollow}, function(err, user) {
      if (err) {
        json.unhappy(err, res);
      } else {
        currUser.following.push(user._id);
        currUser.save(function(err, item) {
          /**
           * Notify the user
           */
          event.trigger('follow', {user: user, actor: req.user});

          if (err) {
            return json.unhappy(err, res);
          }
          json.happy({
            record: item
          }, res);
        });
      }
    });
  };

  /**
   * Stop following an already following user
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.unfollow = function(req, res) {
    var currUser = req.user;
    var toUnFollow = req.param('userId');

    var already = req.user.following.filter(function(item) {
      return item.username === toUnFollow;
    }).length;
    if (!already) {
      return json.unhappy('You are already not following', res);
    }

    User.findOne({username: toUnFollow}, function(err, user) {
      if (err) {
        json.unhappy(err, res);
      } else {
        currUser.following.splice(currUser.following.indexOf(user._id), 1);
        currUser.save(function(err, item) {
          if (err) {
            return json.unhappy(err, res);
          }
          json.happy({
            record: item
          }, res);
        });
      }
    });
  };

  /**
   * Upload a user's face
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.avatar = function(req, res) {
    ImageHelperUtil = System.plugins["Image"];
    var user = req.user;
    var file = req.files[0];
    var file_extension = file.mimetype.replace('image/','');
    /**
     * Check extension
     */
    if (['png', 'jpg', 'jpeg', 'gif'].indexOf(file_extension) === -1) {
      return json.unhappy({message: 'Only images allowed.'}, res);
    }

    /**
     * Get file name
     * @type {String}
     */
    var filename = file.path.substr(file.path.lastIndexOf('/')+1);
    var filepath = filename; 

    var fs = require('fs');
    
    /*
    var oldpath = "./public/uploads/"+filename;
    var newpath = "./public/uploads/profiles/"+filename;
    move(oldpath, newpath, function(err){
      if(err){
        return json.unhappy({message: 'Error in moving file.'}, res);
      }
    });
    file.path = newpath;
    */

    if(System.config.IMG_STATIC !== ""){
      ImageHelperUtil.sendToPHPServer(file, user.id);
    }

    var AWS = require('aws-sdk');
    
    /**
     * Config params stored in the environment
     * @type {String}
     */
    AWS.config.accessKeyId = System.config.aws.accessKeyId;
    AWS.config.secretAccessKey = System.config.aws.secretAccessKey;

    /**
     * Set bucket and other params
     * @type {Object}
     */
    var params = {
      Bucket: 'atwork', 
      Key: filename,
      Body: fs.readFileSync(file.path),
      ContentType: 'application/image',
      ACL: 'public-read'
    };

    if(AWS.config.accessKeyId !== undefined){
      var s3 = new AWS.S3();

      /**
       * Upload to s3
       */
      s3.putObject(params, function(error, data) {
        if (error) {
          throw error;
        }
      });

      /**
       * Update the user with the s3 path, even if its not yet uploaded
       * @type {String}
       */
      user.face = 'https://s3.amazonaws.com/atwork/' + filepath;
    }else{

      /**
       * Update the user with the system path, even if its not yet uploaded
       * @type {String}
       */
      try{
        if(user.face !== "" && user.face !== undefined){
          if(user.face.indexOf("tamizhans.in") == -1){
            fs.unlinkSync("./public/"+user.face);
          }else{
            ImageHelperUtil.deleteImgFromPHPServer(user.id, 0);
          }
        } 
      }catch(e){
          console.log("Error",e);
      }
      if(System.config.IMG_STATIC == ""){
        user.face = 'uploads/' + filepath;
      }else{
        user.face = System.config.IMG_STATIC_URL+'?image_id=' + user.id;
      }
    }
    user.save();

    /**
     * Return a locally uploaded file for faster response
     * @type {String}
     */
    return json.happy({
      face: file.path.replace('public/', '')
    }, res);

  };

  /**
   * Return a single user as json
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.single = function(req, res) {
    /**
     * The search criteria
     * @type {Object}
     */
    var criteria = {};

    /**
     * Can accept user's username
     */
    criteria.username = req.params.userId;

    User.findOne(criteria).populate('following').exec(function(err, user) {
      if (err) {
        return json.unhappy(err, res);
      } else if (user) {
        //now get followers
        return User.find({following: user._id}, function(err, followers) {
          if (err) {
            return json.unhappy(err, res);
          }
          return json.happy({
            record: user,
            followers: followers,
            following: user.following,
            alreadyFollowing: req.user.following.filter(function(item) {
              return item.username === user.username;
            }).length ? true : false
          }, res);
        });
      } else {
        return json.unhappy({message: 'User not found'}, res);
      }
    });
  };

  /**
   * Return a single user's notification
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.notifications = function(req, res) {
    User.findOne({_id: req.user._id, 'notifications.unread': true})
    .lean()
    .populate('notifications')
    .populate('notifications.post')
    .populate('notifications.user')
    .populate('notifications.actor')
    .exec(function(err, user) {
      if (err) {
        return json.unhappy(err, res);
      } else if (user) {
        user.notifications = user.notifications.filter(function(item) {
          return item.unread;
        });
        return json.happy({
          record: user,
          notifications: user.notifications.slice(0, 10)
        }, res);
      } else {
        return json.happy({message: 'No unread notifications.'}, res);
      }
    });
  };

  /**
   * Return a single user's notification
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.markRead = function(req, res) {
    User.findOne({_id: req.user._id, 'notifications.unread': true})
    .populate('notifications')
    .populate('notifications.post')
    .populate('notifications.user')
    .exec(function(err, user) {
      if (err) {
        return json.unhappy(err, res);
      } else if (user) {
        //now get followers
        user.notifications.map(function(item) {
          if (item._id.toString() === req.params.notificationId) {
            item.unread = false;
          }
        });
        user.save(function () {
          user.notifications = user.notifications.filter(function(item) {
            return item.unread;
          });
          return json.happy({
            notifications: user.notifications.slice(0, 10)
          }, res);
        });
      } else {
        return json.happy({message: 'Already marked as unread.'}, res);
      }
    });
  };

  /**
   * Self as json
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}     
   */
  obj.me = function(req, res) {
    if (req.user) {
      json.happy({
        record: req.user,
        token: req.token
      }, res);
    }
  };

  /**
   * Search users by full name
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.search = function(req, res) {
    var keyword = req.param('keyword');
    var criteria = {};
    if (req.query.onlyUsernames) {
      criteria = { username: new RegExp(keyword, 'ig') };
    } else {
      criteria = {
        $or: [
          { name: new RegExp(keyword, 'ig') },
          { username: new RegExp(keyword, 'ig') }
        ]
      };
    }

    /**
     * Avoid self
     * @type {String}
     */
    criteria._id = {$ne: req.user._id};

    User.find(criteria, null, {sort: {name: 1}}).exec(function(err, items) {
      if (err) {
        return json.unhappy(err, res);
      }
      return json.happy({ items: items }, res);
    });
  };

  //Have to move to a common function

  function move(oldPath, newPath, callback) {
    var fs = require('fs');
    fs.rename(oldPath, newPath, function (err) {
        if (err) {
            if (err.code === 'EXDEV') {
                copy();
            } else {
                callback(err);
            }
            return;
        }
        callback();
    });

    function copy() {
        var readStream = fs.createReadStream(oldPath);
        var writeStream = fs.createWriteStream(newPath);

        readStream.on('error', callback);
        writeStream.on('error', callback);

        readStream.on('close', function () {
            fs.unlink(oldPath, callback);
        });

        readStream.pipe(writeStream);
    }
  }

  return obj;
};