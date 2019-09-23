'use strict';

angular.module('atwork.galleries')
  .controller('GalleryCtrl',[
    '$scope',
    '$rootScope',
    '$routeParams',
    '$timeout',
    'appAuth',
    'appToast',
    'appStorage',
    'appLocation',
    'appWebSocket',
    'UploadService',
    function ($scope, $rootScope, $routeParams, $timeout, appAuth, appToast, appStorage, appLocation, appWebSocket, UploadService) {
        // Set of Photos
        $scope.photos = [
            {src: 'http://farm9.staticflickr.com/8042/7918423710_e6dd168d7c_b.jpg', desc: 'Image 01'},
            {src: 'http://farm9.staticflickr.com/8449/7918424278_4835c85e7a_b.jpg', desc: 'Image 02'},
            {src: 'http://farm9.staticflickr.com/8457/7918424412_bb641455c7_b.jpg', desc: 'Image 03'},
            {src: 'http://farm9.staticflickr.com/8179/7918424842_c79f7e345c_b.jpg', desc: 'Image 04'},
            {src: 'http://farm9.staticflickr.com/8315/7918425138_b739f0df53_b.jpg', desc: 'Image 05'},
            {src: 'http://farm9.staticflickr.com/8461/7918425364_fe6753aa75_b.jpg', desc: 'Image 06'}
        ];
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

        $rootScope.filesSrc = [];

        $scope.imageUpload = function(event){
            var files = event.target.files; //FileList object

            var allowed = ["jpeg", "png", "gif", "jpg"];
            var found = false;
            var img;
            img = new Image();

            allowed.forEach(function(extension) {
                for (var i = 0; i < files.length; i++) {
                    var file = files[i];
                    if (file.type.match('image/'+extension)) {
                        found = true;
                    }
                }
            });
            if(!found){
                alert('file type should be .jpeg, .png, .jpg, .gif');
                return;
            }
            UploadService.setFilesToUpload(files);

            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                    var reader = new FileReader();
                    reader.onload = $scope.imageIsLoaded; 
                    reader.readAsDataURL(file);
            }
        }

        $scope.imageIsLoaded = function(e){
            $scope.$apply(function() {
                $rootScope.filesSrc = []; //Added for single image, should be removed after supporting for multiple upload
                $rootScope.filesSrc.push(e.target.result);
                UploadService.setFilesSrc($rootScope.filesSrc);
            });
        }


        /**
         * Show image in Pop
         * @param  {Boolean} isValid Will be true if form validation passes
         * @return {Void}
         */
        $scope.imagePop = function($ev, imageUrl){
            appGalleryPop.showImagePop($ev, imageUrl);
        }

        }
    ]);

    angular.module('imageResizer', ['imageupload'])

.config(['$compileProvider', function($compileProvider) {   
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|data|blob|chrome-extension):/);
    $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|ftp|mailto|data|blob|chrome-extension):/);
}])

.controller('AppCtrl', ['$scope', function($scope) {
	$scope.config = {
		width: 600,
		height: 600,
		quality: 1
	};
}]);

