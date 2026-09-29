var MarketJSPlatformAdvancedRewardsAPI={
	initialize: function (callback) {    
        // Do something here
        // this.doSomething(callback)
    },
	listAllRewards:function(callback){
		var session_id = ig.game.load(_SESSION_ID);
		 $.ajax({
            type: 'POST',
            dataType: 'json',
            success: callback,
            data: {
                game_id: _GAME_ID,
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
                        var data = response.data; //object array of the prizes                        
                        // Parse through all the rewards, getting all the details
                        // Then, trigger ImpactJS, to modify the data object in strings.js with the correct list of available rewards
                        console.log("Game data received");
                        break;                     
                    case 405:
                        console.log("Game not found");
                        break;
                    default:
                        console.log(response.status.message);
                }
            },
        })
	},

	assignRandom:function(callback){
		var session_id = ig.game.load(_SESSION_ID);
		$.ajax({
            type: 'POST',
            dataType: 'json',
            success: callback,
            url: _API_URL + '/api/advanced_reward/assign_random',
            data: {
                session_id: session_id,
                game_id: _GAME_ID,
            }, 
            beforeSend: function () {                
                $('#overlay-loading').show();
            },
            complete: function (response) {
                response = JSON.parse(response.responseText);
                $('#overlay-loading').hide();

                switch(response.status.code){
                	//Reward assigned
                    case 200:                        
                        var data = response.data;
                        // Parse through all the rewards, getting all the details
                        // Then, trigger ImpactJS, to modify the data object in strings.js with the correct list of available rewards
                        console.log(response.status.message);
                        console.log(data);
                        break;
                    //Not eligible. Player already win something
                    case 401:
                    //No reward remaining
                    case 402:
                    //did not win anything
                    case 403:                    	
                    //Advanced Rewards not enabled
                    case 404:
                    //Not logged in
                    case 405:
                    //game not found
                    case 406:
                    default:
                        console.log(response.status.message);
                }
            },
        })
	}
}