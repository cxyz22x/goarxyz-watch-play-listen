var MarketJSPlatformAdvancedRewardsAPI = {
    initialize: function (callback) {    
        // Do something here
        // this.doSomething(callback)
    },

    listAllRewards: function(callback){
        $.ajax({
            type: 'POST',
            dataType: 'json',
            success: callback,
            data: {
                game_id: _GAME_ID
            },          
            url: _API_URL + '/api/advanced_reward/list_all',

            beforeSend: function () {                
                $('#overlay-loading').show();
            },
            complete: function (response) {
                response = JSON.parse(response.responseText);
                $('#overlay-loading').hide();

                switch(response.status.code){
                    case 200:                        
                        var data = response.status.data;
                        // Parse through all the rewards, getting all the details
                        // Then, trigger ImpactJS, to modify the data object in strings.js with the correct list of available rewards
                        console.log("Do something");
                        break;
                    case 401:
                        console.log("Do something");                        
                        break;
                    case 402:
                        console.log("Do something");
                        break;
                    default:
                        console.log("Default ... do something");
                }
            },
        })
    },

    assignRandom: function(callback){
        var session_id = ig.game.load(_SESSION_ID);
        
        $.ajax({
            type: 'POST',
            dataType: 'json',
            success: callback,
            url: _API_URL + '/api/advanced_reward/assign_random',
            data: {
                session_id: session_id,
                game_id: _GAME_ID
            }, 
            beforeSend: function () {                
                $('#overlay-loading').show();
            },
            complete: function (response) {
                response = JSON.parse(response.responseText);
                $('#overlay-loading').hide();

                switch(response.status.code){
                    case 200:                        
                        var data = response.status.data;
                        // Parse through all the rewards, getting all the details
                        // Then, trigger ImpactJS, to modify the data object in strings.js with the correct list of available rewards
                        console.log("Do something");
                        break;
                    case 401:
                        console.log("Do something");                        
                        break;
                    case 402:
                        console.log("Do something");
                        break;
                    default:
                        console.log("Default ... do something");
                }
            },
        })
    },

}