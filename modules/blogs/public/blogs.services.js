'use strict';

angular.module('atwork.blogs')
  .factory('appBlogs', ['$resource',
    function($resource) {
      return {
        single: $resource('blogs/:blogId/:action', {
            blogId: '@_id'
          }, {
            like: {
              method: 'POST',
              params: {action: 'like'}
            },
            unlike: {
              method: 'POST',
              params: {action: 'unlike'}
            },
            comment: {
              method: 'POST',
              params: {action: 'comment'}
            },
            likes: {
              method: 'GET',
              params: {action: 'likes'}
            }
          }),
        feed: $resource('blogs/'),
      }
    }
  ])
  .filter('htmlToPlaintext', function() {
    return function(text) {
      var text = String(text).replace(/<[^>]+>/gm, '').replace(/&nbsp;/g, '');
      return  text ? text : '';
    };
  })
  .filter('appBlogPostFormat', [
    '$sce',
    function($sce) {
      return function(text) {
        var hashtags = new RegExp('#([A-Za-z0-9]+)', 'g');
        text = text.replace(hashtags, function(hashtag) {
          return '<a href="/feed/'+ hashtag.replace('#', '') +'">' + hashtag + '</a>'
        });

        var mentions = new RegExp('@([A-Za-z0-9_]+)', 'g');
        text = text.replace(mentions, function(mention) {
          return '<a href="/profile/'+ mention.replace('@', '') +'">' + mention + '</a>'
        });
        
        /**
         * Emoticons
         */
        var emots = [
          {
            key: ':)',
            value: 'fa-smile-o'
          }, {
            key: ':|',
            value: 'fa-meh-o'
          }, {
            key: ':(',
            value: 'fa-frown-o'
          }, {
            key: '(y)',
            value: 'fa-thumbs-o-up'
          }, {
            key: '(n)',
            value: 'fa-thumbs-o-down'
          }, {
            key: ':+1',
            value: 'fa-thumbs-up'
          }, {
            key: '(h)',
            value: 'fa-heart'
          }, {
            key: '(i)',
            value: 'fa-lightbulb-o'
          },
        ];

        var emotTemplate = '<md-inline-list-icon class="yellow fa {{emoticon}}"></md-inline-list-icon>';
        for (var i in emots) {
          var key = emots[i].key;
          var value = emots[i].value;
          text = text.replace(key, emotTemplate.replace('{{emoticon}}', value));
        };
        
        return $sce.trustAsHtml(text);
      };
    }
  ])
  .factory('appBlogsFeed', [
    'appBlogs',
    'ngMeta',
    'MetaTagsService',
    function(appBlogs, ngMeta, MetaTagsService) {
      return {
        getBlogs: function(options, cb) {
          options = options || {};
          var userId = options.userId;
          var hashtag = options.hashtag;
          var blogId = options.blogId;
          var streamId = options.streamId;
          var passedData = options.passedData;

          /**
           * Configuration for the service
           * that will also be returned
           * @type {Object}
           */
          var config = options;

          if (userId) {
            /**
             * TIMELINE: If there is a userId, let's load feeds of the specific user
             */
            /**
             * Disable posting
             * @type {Boolean}
             */
            config.noPosting = true;
            /**
             * Show limited comments
             * @type {Boolean}
             */
            config.limitComments = true;

            /**
             * Prepare the request
             */
            var timelineData = appBlogs.timeline.get({
              userId: userId,
              timestamp: config.lastUpdated,
              filter: config.feedsFilter,
              limitComments: config.limitComments,
              page: config.feedPage
            }, function() {
              doUpdate(timelineData);
            });

          } else if (streamId) {
            /**
             * STREAM: If there is a streamId, let's load feeds of the specific stream
             */
            
            /**
             * Show limited comments
             * @type {Boolean}
             */
            config.limitComments = true;

            /**
             * Prepare the request
             */
            var streamsData = appBlogs.stream.get({
              streamId: streamId,
              timestamp: config.lastUpdated,
              filter: config.feedsFilter,
              limitComments: config.limitComments,
              page: config.feedPage
            }, function() {
              doUpdate(streamsData);
            });
          } else if (blogId) {
            /**
             * SINGLE: If there is a postId, let's load a single feed
             */
            /**
             * Disable filtering if its a single feed
             * @type {Boolean}
             */
            config.noFiltering = true;
            /**
             * Disable posting
             * @type {Boolean}
             */
            config.noPosting = true;
            /**
             * No load-more button
             * @type {Boolean}
             */
            config.noMorePosts = true;
            /**
             * Get ready to show all comments
             */
            delete config.limitComments;

            /**
             * Prepare the request
             */
            var timelineData = appBlogs.single.get({
              blogId: blogId, 
              limitComments: config.limitComments,
              allowMarking: true
            }, function() {
              /**
               * The retrieved record is the only one to show
               * @type {Array}
               */
              //Set Meta tag for URL sharing
              ngMeta.setTitle(timelineData.res.record.title);
              ngMeta.setTag('description', timelineData.res.record.short_desc);
              var singleRecord = timelineData.res.record;
              MetaTagsService.setTags({
                // General SEO
                'title': "Tamizhans Social Network",
                // OpenGraph
                'og:type': 'Blog',
                'og:url': 'http://www.tamizhans.com/blog/'+singleRecord._id,
                'og:title': singleRecord.title,
                'og:description': singleRecord.short_desc,
                //'og:image': singleRecord.image,
                /* Twitter
                'twitter:card': 'summary_large_image',
                'twitter:creator': article.twitter_id,
                'twitter:title': article.title,
                'twitter:description': article.description,
                'twitter:image': article.image,
                */
              });
              
              timelineData.res.records = [timelineData.res.record];
              doUpdate(timelineData);

              /**
               * Set the last updated timestamp
               */
              config.lastUpdated = Date.now();
              config.showBack = true;
            });
          } else {
            /**
             * FEED: If there is no postId and no userId, let's load the user's latest feed
             */
            /**
             * Limit comments
             * @type {Boolean}
             */
            config.limitComments = true;

            /**
             * Prepare the request
             */
            var feedData = appBlogs.feed.get({
              timestamp: config.lastUpdated, 
              filter: config.feedsFilter, 
              limitComments: config.limitComments,
              page: config.feedPage
            }, function() {
              doUpdate(feedData);
            });
          }

          /**
           * If data was sent to the function directly
           * update it for faster client side updates
           */
          if (passedData) {
            doUpdate(passedData);
          }

          /**
           * Default feedcount to 0
           * @type {Number}
           */
          config.newFeedCount = 0;

          /**
           * Function to update the feed on the client side
           * @param  {Object} data The data received from endpoint
           * @return {Void}
           */
          function doUpdate(data) {
            config.lastUpdated = Date.now();
            data.config = config;
            cb(data);
          }

        },
      }
    }
  ])
  .directive('awBlogItem', [
    'appBlogs',
    'appWebSocket',
    'appAuth',
    'appDialog',
    function(appBlogs, appWebSocket, appAuth, appDialog) {
      return {
        templateUrl: '/modules/blogs/views/blog-row.html',
        controller: [
          '$scope',
          function($scope) {

            /**
             * Like the post
             * @param  {Object} item The item object
             * @return {Void}      
             */
            $scope.doLike = function(item) {
              item.liked = true;
              appBlogs.single.like(item, function(response) {
                angular.extend(item, response.res.record);
              });
            };

            /**
             * Unlike the post
             * @param  {Object} item The item object
             * @return {Void}      
             */
            $scope.undoLike = function(item) {
              item.liked = false;
              appBlogs.single.unlike(item, function(response) {
                angular.extend(item, response.res.record);
              });
            };

            /**
             * Comment on a post
             * @param  {Boolean} isValid Will be true if form validation passes
             * @return {Void}
             */
            $scope.comment = function(isValid, item) {
              if (isValid) {
                var commentContent = this.content;
                
                /**
                 * Enable client side comments update for faster response time
                 */
                item.commentEnabled = false;
                item.comments.unshift({
                  creator: appAuth.getUser(),
                  content: commentContent
                });

                item.comment = commentContent;

                appBlogs.single.comment(item, function(response) {
                  angular.extend(item, response.res.record);
                  item.commentEnabled = false;
                });
                
              }
            };

            /**
             * Show the list of likers for a specific post
             * @param  {Object} item The post item
             * @return {Void}
             */
            $scope.showLikers = function(ev, item) {
              /**
               * Get the likers
               */
              appBlogs.single.likes({
                postId: item._id
              }, function(response) {
                /**
                 * Show dialog
                 */
                appDialog.show({
                  controller: [
                    '$scope',
                    'appDialog',
                    function($scope, appDialog) {
                      /**
                       * Assign likers to the users variable
                       * @type {Array}
                       */
                      $scope.users = response.res.records;
                      /**
                       * Hide the dialog
                       * @return {Void}
                       */
                      $scope.hide = function() {
                        appDialog.hide();
                      };
                    }
                  ],
                  templateUrl: '/modules/users/views/users-dialog.html',
                  targetEvent: ev,
                });
              });
            };

          }
        ]
      }
    }
  ])
  .directive('awBlogSingle', [
    'appBlogs',
    'appWebSocket',
    'appAuth',
    'appDialog',
    function(appBlogs, appWebSocket, appAuth, appDialog) {
      return {
        templateUrl: '/modules/blogs/views/blog-single.html',
        controller: [
          '$scope',
          function($scope) {

            /**
             * Like the post
             * @param  {Object} item The item object
             * @return {Void}      
             */
            $scope.doLike = function(item) {
              item.liked = true;
              appBlogs.single.like(item, function(response) {
                angular.extend(item, response.res.record);
              });
            };

            /**
             * Unlike the post
             * @param  {Object} item The item object
             * @return {Void}      
             */
            $scope.undoLike = function(item) {
              item.liked = false;
              appBlogs.single.unlike(item, function(response) {
                angular.extend(item, response.res.record);
              });
            };

            /**
             * Comment on a post
             * @param  {Boolean} isValid Will be true if form validation passes
             * @return {Void}
             */
            $scope.comment = function(isValid, item) {
              if (isValid) {
                var commentContent = this.content;
                
                /**
                 * Enable client side comments update for faster response time
                 */
                item.commentEnabled = false;
                item.comments.unshift({
                  creator: appAuth.getUser(),
                  content: commentContent
                });

                item.comment = commentContent;

                appBlogs.single.comment(item, function(response) {
                  angular.extend(item, response.res.record);
                  item.commentEnabled = false;
                });
                
              }
            };

            /**
             * Show the list of likers for a specific post
             * @param  {Object} item The post item
             * @return {Void}
             */
            $scope.showLikers = function(ev, item) {
              /**
               * Get the likers
               */
              appBlogs.single.likes({
                postId: item._id
              }, function(response) {
                /**
                 * Show dialog
                 */
                appDialog.show({
                  controller: [
                    '$scope',
                    'appDialog',
                    function($scope, appDialog) {
                      /**
                       * Assign likers to the users variable
                       * @type {Array}
                       */
                      $scope.users = response.res.records;
                      /**
                       * Hide the dialog
                       * @return {Void}
                       */
                      $scope.hide = function() {
                        appDialog.hide();
                      };
                    }
                  ],
                  templateUrl: '/modules/users/views/users-dialog.html',
                  targetEvent: ev,
                });
              });
            };

          }
        ]
      }
    }
  ])
  ;
  