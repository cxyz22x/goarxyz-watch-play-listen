// Leaderboard
var _GLOBALSCORE = 0; // assigned by game at gameover
var _DEVELOPMENT_MODE = false; // Change this to false, before deployment
var _GAME_ID, _API_URL;
var _SESSION_ID = 'session_id_spin-to-win-advanced-inventory';

console.log('_DEVELOPMENT_MODE:', _DEVELOPMENT_MODE)
if (_DEVELOPMENT_MODE) {
    // Development mode game ids
    _GAME_ID = '4785074604081152' // Game1
    _API_URL = 'http://localhost:10010';

    // Secondary game ids for registration reasons (register for other games too)
    //    _GAME_ID2 = '5910974510923776'; // Game2
    //    _GAME_ID3 = '5348024557502464'; // Game3
    //    _GAME_ID4 = '5910974510923776'; // test: repeat of game2
    //    _GAME_ID5 = '5910974510923776'; // test: repeat of game2

} else {
    // Production mode game ids

    _GAME_ID = '5712756478050304'; // Spin To Win Demo
    _API_URL = 'https://marketjs-vas.appspot.com'; // Production

    //    _GAME_ID = '5648161435549696' // 3 Card Monte - Production
    //    _GAME_ID1 = '5659313586569216' // Leave Me Alone - Production
    //    _GAME_ID2 = '5634472569470976'; // Pet Hop
    //    _GAME_ID3 = '5118084088070144'; // Soccer Pro
    //    _GAME_ID4 = '5109799364591616'; // Zero Collision
    //    _GAME_ID5 = '5707702298738688'; // Trixology

}

// Update all URLs appropriately (inject in appropriate divs)
function updateURLs() {
    console.log('updating URLs ...')

    $('#register-form').attr('action', _API_URL + '/api/user/register')
    $('#login-form').attr('action', _API_URL + '/api/user/login')
    $('#reset-password-form').attr('action', _API_URL + '/api/user/reset_password')

}

function updateGameIDs() {
    $('#reset-password-game-id').val(_GAME_ID);
    $('#login-game-id').val(_GAME_ID);

    $('#register-game-id1').val(_GAME_ID);
    //    $('#register-game-id2').val(_GAME_ID2);
    //    $('#register-game-id3').val(_GAME_ID3);
    //    $('#register-game-id4').val(_GAME_ID4);
    //    $('#register-game-id5').val(_GAME_ID5);

}

$(document).ready(function () {
    // Enable True/False mechanism, for Terms of Service checkbox
    $("[id^=register-tos-agree]").each(function () {
        console.log('init .. ', $(this).attr('id'))
        $(this).click(function () {
            if ($(this).prop('checked')) {
                $(this).val('True');
                console.log('checked');
            } else {
                $(this).val('False');
                console.log('unchecked');
            }
        });
    });

    // Very important
    updateURLs();
    updateGameIDs();

    $("#register-non-unique-id").keyup(function () {
        $("label").remove(".emailError");
    });
    $(".mySelect").change(function () {
        $("label").remove(".buError");
    });
    $("#login-email").keyup(function () {
        $("label").remove(".myerror");
    });

    var isMobile = {
        Android: function () {
            return navigator.userAgent.match(/Android/i);
        },
        BlackBerry: function () {
            return navigator.userAgent.match(/BlackBerry/i);
        },
        iOS: function () {
            return navigator.userAgent.match(/iPhone|iPad|iPod/i);
        },
        Opera: function () {
            return navigator.userAgent.match(/Opera Mini/i);
        },
        Windows: function () {
            return navigator.userAgent.match(/IEMobile/i);
        },
        any: function () {
            return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
        }
    };

    if (!isMobile.any()) {
        $("body").css("background", "#000");
    }
});

var MarketJSPlatformLeaderboardAPI = {
    windowIDs: [
        'leaderboard',
        'login',
        'register',
        'reset-password'
    ],
    navigationTabs: [
         'leaderboard-navigation-tab-alltime',
         'leaderboard-navigation-tab-weekly',
         'leaderboard-navigation-tab-daily',
    ],
    leaderboardEntryHeight: null,
    initialize: function () {
        this.hideAll();

        this.getAllTimeHTML(function () {
            MarketJSPlatformLeaderboardAPI.show();

        });
    },

    submitScore: function (session_id, score, callback) {
        var session_id = session_id;

        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                session_id: session_id,
                game_id: _GAME_ID,
                score: score,
            },
            success: callback,
            url: _API_URL + '/api/leaderboard_entry/submit',

            beforeSend: function () {
                $('#overlay-loading').show();
            },
            complete: function (response) {
                $('#overlay-loading').hide();
                console.log(response);
            },
        })
    },

    adjustPopupSizePos: function (popup) {
        var box = $(popup);
        box.css('height', 'auto');
        var h = box.height();

        if (h > 0.8 * window.innerHeight) box.css('height', window.innerHeight * 0.8);

        this.centerPopupVertically(box);
    },

    adjustLeaderboardHeight: function () {
        //        console.log('adjustLeaderboardHeight window.innerHeight:', window.innerHeight)

        var box = $('#box-leaderboard');
        if (window.innerHeight < window.innerWidth) { // landscape
            if (window.innerHeight < 768) {
                box.css('height', window.innerHeight * 0.8)
            } else {
                box.css('height', window.innerHeight * 0.6)
            }
        } else { // portrait
            if (window.innerHeight < 768) {
                box.css('height', window.innerHeight * 0.8)
            } else {
                box.css('height', window.innerHeight * 0.8)
            }
        }

        this.centerDivVertically($('#box-leaderboard'));

    },

    centerPopupVertically: function (div) {
        var h = div.height();

        if (window.innerHeight >= 800) {
            var m = (window.innerHeight - h) / 2;
            div.css('margin-top', m);
        } else {
            var m = (window.innerHeight - h) * 1.2 / 2;
            div.css('margin-top', m / 2);
        }
    },

    centerDivVertically: function (div) {
        var h = div.height();
        //        console.log('window.innerHeight', window.innerHeight)

        var m = (window.innerHeight - h) / 2;
        if (window.innerHeight >= 800) {
            div.css('margin-top', m);
        } else {
            div.css('margin-top', m / 2);
        }
    },
    show: function () {
        this.hideAll();

        $('#leaderboard').show();

        this.getAllTimeHTML(MarketJSPlatformLeaderboardAPI.adjustLeaderboardHeight())
    },
    hide: function () {
        $('#leaderboard').hide();
    },
    hideAll: function () {
        for (i = 0; i < this.windowIDs.length; i++) {
            $('#' + this.windowIDs[i]).hide();
        }
    },
    removeAllHighlightedNavigationTabs: function () {
        for (i = 0; i < this.navigationTabs.length; i++) {
            $('#' + this.navigationTabs[i]).removeClass('box-leaderboard-navigation-item-highlighted');
        }
    },
    highlightNavigationTab: function (div) {
        this.removeAllHighlightedNavigationTabs();
        div.addClass('box-leaderboard-navigation-item-highlighted');
    },
    getAllTimeHTML: function (game_id, callback) {
        this.getAllTime('html', game_id, callback);
    },
    getWeeklyHTML: function (game_id, callback) {
        this.getWeekly('html', game_id, callback);
    },
    getAllTimeJSON: function (game_id, callback) {
        this.getAllTime('json', game_id, callback);
    },
    getWeeklyJSON: function (game_id, callback) {
        this.getWeekly('json', game_id, callback);
    },
    getDailyHTML: function (game_id, callback) {
        this.getDaily('html', game_id, callback);
    },
    getAllTime: function (output_type, game_id, callback) {
        this.highlightNavigationTab($('#leaderboard-navigation-tab-alltime'))

        var session_id = ig.game.load(_SESSION_ID);

        if (game_id === undefined) {
            console.log('game_id not defined, defaulting to ', _GAME_ID)
            game_id = _GAME_ID; // select default GAME_ID from beginning of this JS file.
        } else {
            console.log('game_id defined as', game_id)
            _GAME_ID = game_id;
        }

        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                output_type: output_type, // 'json', or 'html'
                session_id: session_id,
                game_id: game_id,
                interval: 'alltime',
            },
            success: callback,
            url: _API_URL + '/api/leaderboard_entry/read',

            beforeSend: function () {
                $('#overlay-loading').show();
            },

            complete: function (response) {
                $('#overlay-loading').hide();
                response = JSON.parse(response.responseText);
                //                console.log('response:', response)

                if (output_type == 'html') {
                    //                    console.log('html output detected, filling in template')
                    $('#leaderboard-entry').html(response.data)

                    MarketJSPlatformLeaderboardAPI.adjustLeaderboardHeight();

                }
            },

        })
    },

    getDaily: function (output_type, game_id, callback) {
        this.highlightNavigationTab($('#leaderboard-navigation-tab-daily'))

        var session_id = ig.game.load(_SESSION_ID);

        if (game_id === undefined) {
            console.log('game_id not defined, defaulting to ', _GAME_ID)
            game_id = _GAME_ID; // select default GAME_ID from beginning of this JS file.
        } else {
            console.log('game_id defined as', game_id)
            _GAME_ID = game_id;
        }

        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                output_type: output_type, // 'json', or 'html'
                session_id: session_id,
                interval: 'daily',
                game_id: game_id,
            },
            success: callback,
            url: _API_URL + '/api/leaderboard_entry/read',

            beforeSend: function () {
                $('#overlay-loading').show();
            },

            complete: function (response) {
                $('#overlay-loading').hide();
                response = JSON.parse(response.responseText);
                //                console.log('response:', response);

                if (output_type == 'html') {
                    //                    console.log('html output detected, filling in template')
                    $('#leaderboard-entry').html(response.data)
                    MarketJSPlatformLeaderboardAPI.adjustLeaderboardHeight();

                }
            },
        })
    },

    getWeekly: function (output_type, game_id, callback) {
        this.highlightNavigationTab($('#leaderboard-navigation-tab-weekly'))

        var session_id = ig.game.load(_SESSION_ID);

        if (game_id === undefined) {
            console.log('game_id not defined, defaulting to ', _GAME_ID)
            game_id = _GAME_ID; // select default GAME_ID from beginning of this JS file.
        } else {
            console.log('game_id defined as', game_id)
            _GAME_ID = game_id;
        }

        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                output_type: output_type, // 'json', or 'html'
                session_id: session_id,
                interval: 'weekly',
                game_id: game_id,
            },
            success: callback,
            url: _API_URL + '/api/leaderboard_entry/read',

            beforeSend: function () {
                $('#overlay-loading').show();

                console.log('we are here')
            },

            complete: function (response) {
                $('#overlay-loading').hide();
                response = JSON.parse(response.responseText);
                //                console.log('response:', response)

                // Only work with html output type atm
                if (output_type == 'html') {
                    //                    console.log('html output detected, filling in template')
                    $('#leaderboard-entry').html(response.data)
                    MarketJSPlatformLeaderboardAPI.adjustLeaderboardHeight();

                }
            },
        })
    },

    logPlay: function(game_id, session_id, callback){
        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                session_id: session_id,
                game_id: game_id,
                increment_plays: 'true',
            },
            success: callback,
            url: _API_URL + '/api/user/update',

            beforeSend: function () {

            },

            complete: function (response) {
                var responseObj = {};
                try{
                    responseObj = JSON.parse(response.responseText);
                }catch(e){
                }
                if (responseObj && responseObj.status.code == '200') {
                    console.log('plays counter incremented successfully');

                } else {
                    console.log('plays counter update failed');
                }

            },
        })
    },
}

//window.addEventListener('orientationchange', function (evt) {
//    MarketJSPlatformLeaderboardAPI.adjustLeaderboardHeight();
//    MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-register');
//    MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-reset-password');
//    MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-login');
//}, false);

$(window).bind('resize', function (e) {
    fixOrientation();
});

function fixOrientation() {

    setTimeout(function () {
        MarketJSPlatformLeaderboardAPI.adjustLeaderboardHeight();
        MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-register');
        MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-reset-password');
        MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-login');

    }, 100);
}

//$(document).bind(
//      'touchmove',
//          function(e) {
//            e.preventDefault();
//          }
//);
//
//$('box-leaderboard').bind('touchmove', function(event){
//    event.stopPropagation();
//});

//$(document).on('touchmove', function(e) {
//    if (!$(e.target).parents('.overlay-container-basic')[0]) {
//        e.preventDefault();
//    }
//});

// Login Script Template here
var MarketJSPlatformLoginAPI = {
    windowIDs: [
        'login',
        'register',
        'leaderboard',
        'reset-password'
    ],
    initialize: function (callback) {
        this.prepareForm(callback);

        // Show registration form immediately
        //this.showRegister();
    },
    setupSession: function (session_id) {
        //        console.log('Saving session_id in localStorage ...')
        ig.game.save(_SESSION_ID, session_id);
    },
    centerDivVectically: function (div) {
        var h = div.height();
        //        console.log('window.innerHeight', window.innerHeight)

        // DUNNO WHY THIS WORKS WELL FOR IPHONE
        if (window.innerHeight < 400) {
            var m = (window.innerHeight - h) / 2;
        } else {
            var m = (window.innerHeight - h) / 2 - h / 4;
        }

        //console.log(h,m)
        div.css('margin-top', m);
    },
    // MINOR BUG: Build a function to correct the margin-left issue. Non critical. Or fix the base template API
    centerDivHorizontally: function (div) {

        if (window.innerWidth > 1440) { // somehow this is the point where the box goes out of alignment
            //            console.log('bigger than 1440, adjusting margin-left')
            var width = div.width();
            var left = (window.innerWidth - width) / 2

            // DOING THIS MAKES NO EFFECT
            div.css('left', left);
        }

    },

    showLogin: function () {
        this.hideAll();
        $('#login').show();
        //        this.centerDivVectically($('#box-login'));
        //        this.centerDivHorizontally($('#box-login'));
        MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-login');
    },
    hideLogin: function () {
        var box = $('#login');
        box.css('height', 'auto');
        box.hide();
    },
    showResetPassword: function () {
        this.hideAll();
        $('#reset-password').show();
        MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-reset-password');
    },
    hideResetPassword: function () {
        var box = $('#reset-password');
        box.css('height', 'auto');
        box.hide();
    },
    showRegister: function () {
        this.hideAll();
        $('#register').show();
        //        this.centerDivVectically($('#box-register'));
        MarketJSPlatformLeaderboardAPI.adjustPopupSizePos('#box-register');
    },
    hideRegister: function () {
        var box = $('#register');
        box.css('height', 'auto');
        box.hide();
    },
    hideAll: function () {
        for (i = 0; i < this.windowIDs.length; i++) {
            $('#' + this.windowIDs[i]).hide();
        }
    },
    prepareForm: function (callback) {
        $('#login-form').ajaxForm({
            beforeSubmit: function () {
                return $('#login-form').valid();
            },
            beforeSend: function () {
                //                console.log('Attempting to log in ...')
                MarketJSPlatformLoginAPI.hideLogin();
                $('#overlay-loading').show()
            },
            dataType: 'json',
            success: callback,
            complete: function (response) {
                $('#overlay-loading').hide()

                // SETUP SESSION
                response = JSON.parse(response.responseText);
                if (response.status.code == 200) {
                    MarketJSPlatformLoginAPI.setupSession(response.data.session_id);
                    MarketJSPlatformPopupAPI.show('Logged in', response.status.message);
                    $(".box-leaderboard-footer").hide();
                } else {
                    $('#login-notification').text(response.status.message);
                    $('#login-notification').addClass('alert-error');
                    $('#login-notification').show();
                    $(".box-leaderboard-footer").show();
                    MarketJSPlatformLoginAPI.showLogin();
                }


            }
        });

        $('#login-form').validate({
            rules: {
                "login-email": {
                    required: true,
                    email: true
                },
                "login-password": {
                    required: true,
                    alphanumeric: true,
                    minlength: 5,
                }
            },

            highlight: function (label) {
                $(label).removeClass('success');
                $(label).addClass('error');
            },
            success: function (label) {
                $(label).removeClass('error');
                $(label).addClass('success');
            }
        });

        $('#register-form').ajaxForm({
            beforeSerialize: function () {
            },
            beforeSubmit: function () {
                if ($("#register-tos-agree").val() !== "True") {
                    $("#register-tos-agree-error").css('display', 'block');
                    return false;
                } else {
                    $("#register-tos-agree-error").css('display', 'none');
                }

                return $('#register-form').valid()
            },
            beforeSend: function () {
                console.log('Attempting to register ...')
                MarketJSPlatformLoginAPI.hideRegister();
                $('#overlay-loading').show()
            },
            dataType: 'json',
            success: callback,
            complete: function (response) {
                $('#overlay-loading').hide();
                // SETUP SESSION
                var responseObj = {};
                try{
                    responseObj = JSON.parse(response.responseText);
                }catch(e){
                    return;
                }

                /*
                // RECAPTCHA ERROR
                if(responseObj && responseObj.status.code == '407'){
                    $('#recaptcha_error').show();
                } else {
                    $('#recaptcha_error').hide();
                }
                */

                // COMPLETED
                if (responseObj && responseObj.status.code == 200) {
                    MarketJSPlatformLoginAPI.hideRegister();
                    ig.game.sessionId = responseObj.data.session_id;
                    MarketJSPlatformLoginAPI.setupSession(ig.game.sessionId);
                    clearFields();
                    ig.game.director.jumpTo(LevelGame);
                    $("#register-error").css('display', 'none');
                } else { // FAILED
                    MarketJSPlatformLoginAPI.showRegister();

                    // REGISTER ERROR TEXT
                    if (responseObj && responseObj.status.code == 402)
                        $('#register-error').text("You have already played");
                    else
                        $('#register-error').text(responseObj.status.message);
                    $("#register-error").css('display', 'block');
                    try {
                        grecaptcha.reset();
                    } catch (e) {
                        
                    }
                }
                
                // CONTINUE THE GAME LOOP AND BGM
                try {
                    ig.visibilityHandler.resumeHandler();
                } catch (e) {

                }
            }
        });

        $('#register-form').validate({
            rules: {
                "register-name": {
                    required: true,
                    minlength: 2,
                    maxlength: 20,
                },
                "register-non-unique-id": {
                    required: true,
                    email: true
                },
            },

            highlight: function (label) {
                $(label).removeClass('success');
                $(label).addClass('error');
            },
            success: function (label) {
                $(label).removeClass('error');
                $(label).addClass('success');
            }
        });


        $('#reset-password-form').ajaxForm({
            beforeSubmit: function () {
                return $('#reset-password-form').valid()
            },
            beforeSend: function () {
                console.log('Attempting to reset password ...')
                MarketJSPlatformLoginAPI.hideResetPassword();
                $('#overlay-loading').show()
            },
            dataType: 'json',
            success: callback,
            complete: function (response) {
                $('#overlay-loading').hide()

                // SETUP SESSION
                try {
                    response = JSON.parse(response.responseText);
                } catch (e) {
                    console.log(e);
                    return;
                }
                if (response.status.code == 200) {

                    $('#login-notification').text(response.status.message);
                    $('#login-notification').removeClass('alert-error');
                    $('#login-notification').addClass('alert-success');
                    $('#login-notification').show();

                    MarketJSPlatformLoginAPI.showLogin();
                } else {
                    $('#reset-password-notification').text(response.status.message);
                    $('#reset-password-notification').addClass('alert-error');
                    $('#reset-password-notification').show();
                    $('#reset-password-email').val('');
                    MarketJSPlatformLoginAPI.showResetPassword();
                }

            }
        });

        $('#reset-password-form').validate({
            rules: {
                "reset-password-email": {
                    required: true,
                    email: true
                },
            },

            highlight: function (label) {
                $(label).removeClass('success');
                $(label).addClass('error');
            },
            success: function (label) {
                $(label).removeClass('error');
                $(label).addClass('success');
            }
        });


    },


}

var MarketJSPlatformAPI = {
    initialize: function (callback) {
        var session_id = ig.game.load(_SESSION_ID);

        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                session_id: session_id,
            },
            success: callback,
            url: _API_URL + '/api/user/check',

            beforeSend: function () {
                //                console.log('Initializing ...')
                $('#overlay-loading').show();
            },
            complete: function (response) {
                //                console.log('finished ...')
                response = JSON.parse(response.responseText);
                $('#overlay-loading').hide();
                if (response.status.code == 200) {
                    $(".box-leaderboard-footer").hide();
                } else {
                    $(".box-leaderboard-footer").show();
                }
            },
        })
    },
}

// LOGOUT API
var MarketJSPlatformLogoutAPI = {
    initialize: function (callback) {
        ig.game.save(_SESSION_ID, null);
    },
}

// JSON_INFO API
var MarketJSJsonInfoAPI = {
    getUserInfo: function (ranking, session_id, callback) {
        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                session_id: session_id,
                game_id: _GAME_ID,
                get_score_ranking:"alltime"
            },
            success: callback,
            url: _API_URL + '/api/user/info',
            beforeSend: function () {
                
            },
            complete: function (response) {
                
            },
        })
    },

    setUserInfo:function(userInfo, session_id, callback) {
        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
                session_id: session_id,
                game_id: _GAME_ID,
                json_info: JSON.stringify(userInfo)
            },
            success: callback,
            url: _API_URL + '/api/user/update',
    
            beforeSend: function () {
                //$('#overlay-loading').show();
            },
            complete: function (response) {
                $('#overlay-loading').hide();
                var responseObj = {};
                try{
                    responseObj = JSON.parse(response.responseText);
                }catch(e){
                }
                if (responseObj && responseObj.status.code == '200') {
                    console.log('user info has been updated successfully');

                } else {
                    console.log('user info update failed');
                }
            }
        })
    }

}

// RESET USER GAME API
/*
var MarketJSPlatformResetUserGameAPI = {
    game_id:getQueryVariable('game_id'),

    reset:function(callback){
        var session_id = localStorage[_SESSION_ID];
        $.ajax({
            type: 'POST',
            dataType: 'json',
            data: {
               session_id:session_id,
               game_id:this.game_id,
            },
            success:callback,
            url: _API_URL + '/api/user/reset', // UNTESTED

            beforeSend:function (){
                console.log('Resetting ...')
                $('#overlay-loading').show();
            },
            complete:function(){
                console.log('Finished ...')
                $('#overlay-loading').hide();
            },
        })
    },
}
*/
var MarketJSPlatformPopupAPI = {
    windowIDs: [
        'popup',
    ],
    centerDivVectically: function (div) {
        var h = div.height();
        //        console.log('window.innerHeight', window.innerHeight)

        // DUNNO WHY THIS WORKS WELL FOR IPHONE
        if (window.innerHeight < 400) {
            var m = (window.innerHeight - h) / 2;
        } else {
            var m = (window.innerHeight - h) / 2 - h / 4;
        }

        //console.log(h,m)
        div.css('margin-top', m);
    },
    show: function (title, content) {
        this.hideAll();
        $('#popup-title').html(title);
        $('#popup-content').html(content);
        $('#popup').show();

        this.centerDivVectically($('#box-popup'));
    },
    hide: function () {
        $('#popup').hide();
    },
    hideAll: function () {
        for (i = 0; i < this.windowIDs.length; i++) {
            $('#' + this.windowIDs[i]).hide();
        }
    },
}
