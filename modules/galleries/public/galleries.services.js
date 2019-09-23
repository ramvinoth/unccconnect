'use strict';

angular.module('atwork.galleries')
  .factory('appGallery', ['$resource',
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
  .directive('awGalleryPop', [
    'appGallery',
    'appWebSocket',
    'appAuth',
    'appDialog',
    function(appGallery, appWebSocket, appAuth, appDialog) {
      return {
        templateUrl: '/modules/galleries/views/popup.html',
        controller: [
          '$scope',
          function($scope) {

          }
        ]
      }
    }
  ])
  .factory('appGalleryPop', [
    'appGallery',
    'appWebSocket',
    'appAuth',
    'appDialog',
    function(appGallery, appWebSocket, appAuth, appDialog){
      return{
        showPopImage: function(ev, imageurl){
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
                $scope.photos = [];
                // initial image index
                $scope._Index = 0;
                // if a current image is the same as requested image
                $scope.isActive = function (index) {
                    return $scope._Index === index;
                };
                // show prev image
                $scope.showPrev = function () {
                    $scope._Index = ($scope._Index > 0) ? --$scope._Index : $scope.photos.length - 1;
                };
                // show next image
                $scope.showNext = function () {
                    $scope._Index = ($scope._Index < $scope.photos.length - 1) ? ++$scope._Index : 0;
                };
                // show a certain image
                $scope.showPhoto = function (index) {
                    $scope._Index = index;
                };
                
                $scope.photos.push({src :imageurl});
                /**
                 * Hide the dialog
                 * @return {Void}
                 */
                $scope.hide = function() {
                  appDialog.hide();
                };
              }
            ],
            templateUrl: '/modules/galleries/views/popup.html',
            targetEvent: ev,
          });
        }
      }
    }
  ])
  .directive('image', function($q) {
    'use strict'

    var URL = window.URL || window.webkitURL;

    var getResizeArea = function () {
        var resizeAreaId = 'fileupload-resize-area';

        var resizeArea = document.getElementById(resizeAreaId);

        if (!resizeArea) {
            resizeArea = document.createElement('canvas');
            resizeArea.id = resizeAreaId;
            resizeArea.style.visibility = 'hidden';
            document.body.appendChild(resizeArea);
        }

        return resizeArea;
    }

    var resizeImage = function (origImage, options) {
        var maxHeight = options.resizeMaxHeight || 300;
        var maxWidth = options.resizeMaxWidth || 250;
        var quality = options.resizeQuality || 0.7;
        var type = options.resizeType || 'image/jpg';

        var canvas = getResizeArea();

        var height = origImage.height;
        var width = origImage.width;

        // calculate the width and height, constraining the proportions
        if (width > height) {
            if (width > maxWidth) {
                height = Math.round(height *= maxWidth / width);
                width = maxWidth;
            }
        } else {
            if (height > maxHeight) {
                width = Math.round(width *= maxHeight / height);
                height = maxHeight;
            }
        }

        canvas.width = width;
        canvas.height = height;

        //draw image on canvas
        var ctx = canvas.getContext("2d");
        ctx.drawImage(origImage, 0, 0, width, height);

        // get the data from canvas as 70% jpg (or specified type).
        return canvas.toDataURL(type, quality);
    };

    var createImage = function(url, callback) {
        var image = new Image();
        image.onload = function() {
            callback(image);
        };
        image.src = url;
    };

    var fileToDataURL = function (file) {
        var deferred = $q.defer();
        var reader = new FileReader();
        reader.onload = function (e) {
            deferred.resolve(e.target.result);
        };
        reader.readAsDataURL(file);
        return deferred.promise;
    };

    var getBase64FromImageUrl = function (url) {
      var img = new Image();
  
      img.setAttribute('crossOrigin', 'anonymous');
  
      img.onload = function () {
          var canvas = document.createElement("canvas");
          canvas.width =this.width;
          canvas.height =this.height;
  
          var ctx = canvas.getContext("2d");
          ctx.drawImage(this, 0, 0);
  
          var dataURL = canvas.toDataURL("image/png");
  
          alert(dataURL.replace(/^data:image\/(png|jpg);base64,/, ""));
      };
  
      img.src = url;
  }

    return {
        restrict: 'A',
        scope: {
            image: '=',
            resizeMaxHeight: '@?',
            resizeMaxWidth: '@?',
            resizeQuality: '@?',
            resizeType: '@?',
        },
        link: function postLink(scope, element, attrs, ctrl) {

            var doResizing = function(imageResult, callback) {
                createImage(imageResult.url, function(image) {
                    var dataURL = resizeImage(image, scope);
                    imageResult.resized = {
                        dataURL: dataURL,
                        type: dataURL.match(/:(.+\/.+);/)[1],
                    };
                    callback(imageResult);
                });
            };

            var applyScope = function(imageResult) {
                scope.$apply(function() {
                    if(attrs.multiple)
                        scope.image.push(imageResult);
                    else
                        scope.image = imageResult; 
                });
            };


            element.bind('change', function (evt) {
                //when multiple always return an array of images
                if(attrs.multiple)
                    scope.image = [];

                var files = evt.target.files;
                for(var i = 0; i < files.length; i++) {
                    //create a result object for each file in files
                    var imageResult = {
                        file: files[i],
                        url: URL.createObjectURL(files[i])
                    };

                    fileToDataURL(files[i]).then(function (dataURL) {
                        imageResult.dataURL = dataURL;
                    });

                    if(scope.resizeMaxHeight || scope.resizeMaxWidth) { //resize image
                        doResizing(imageResult, function(imageResult) {
                            applyScope(imageResult);
                        });
                    }
                    else { //no resizing
                        applyScope(imageResult);
                    }
                }
            });
        }
    };
  })
  .service("PopUpService", [
    'appGalleryPop',
    function(appGalleryPop, $http, $q) {
      return ({
        imagePop: imagePop
      });

      function imagePop($ev, imageurl) {
        appGalleryPop.showPopImage($ev, imageurl);
      }
  }
  ]);