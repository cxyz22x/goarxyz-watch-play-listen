/**
* Injecting cover-start for desktop
*/

if ( typeof (ig) !== "undefined" ) {
    if (!ig.ua.mobile) {   
        ig.module(
            "webaudio-context-patch"
        ).requires(
            'impact.loader'
        ).defines(function () {
            // inject splash loader class
            ig.SplashLoader.inject({
                desktopCoverDIVID: "play-desktop", 
                
                end:function(){
                    if ( this.done ) { return; }

                    this.done = true;
                    clearInterval( this._intervalId );
                    
                    this.tapToStartDiv();
                },
            
                tapToStartDiv:function( onClickCallbackFunction ){
                    /* create DIV */
                    this.desktopCoverDIV = document.createElement("div");
                    this.desktopCoverDIV.id = this.desktopCoverDIVID;
                    this.desktopCoverDIV.setAttribute("class", "play");
                    this.desktopCoverDIV.setAttribute("style", "position: absolute; display: block; z-index: 999999; background-color: rgba(23, 32, 53, 0.7); visibility: visible; font-size: 10vmin; text-align: center; vertical-align: middle; -webkit-touch-callout: none; -webkit-user-select: none; -khtml-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;");
                    this.desktopCoverDIV.innerHTML = "<div style='color:white;background-color: rgba(255, 255, 255, 0.3); border: 2px solid #fff; font-size:20px; border-radius: 5px; position: relative; float: left; top: 50%; left: 50%; transform: translate(-50%, -50%);'><div style='padding:20px 50px; font-family: Arial;'>TAP TO START</div></div>";
    
                    
                    /* inject DIV */
                    var parentDIV = document.getElementById("play").parentNode || document.getElementById("ajaxbar");
                    parentDIV.appendChild(this.desktopCoverDIV);
                    
                    /* reize DIV */
                    try {
                        if ( typeof (ig.sizeHandler) !== "undefined" ) {
                            if ( typeof (ig.sizeHandler.coreDivsToResize) !== "undefined" ) {
                                ig.sizeHandler.coreDivsToResize.push( ("#"+this.desktopCoverDIVID) );
                                if ( typeof (ig.sizeHandler.reorient) === "function" ) {
                                    ig.sizeHandler.reorient();
                                }
                            }
                        }
                        else if ( typeof (coreDivsToResize) !== "undefined" ) {
                            coreDivsToResize.push(this.desktopCoverDIVID);
                            if ( typeof (sizeHandler) === "function" ) {
                                sizeHandler();
                            }
                        }
                    } catch (error) {
                        console.log(error);
                    }
                    
                    
                    /* click DIV */
                    this.desktopCoverDIV.addEventListener("click", function(){

                        /* play audio */
                        try {
                            
                            if ( typeof (ig.soundHandler) !== "undefined" ) {
                                
                                /* init sound handler */
                                if ( typeof (ig.soundHandler.init) === "function" ) {
                                    if ( typeof (ig.soundList) !== "undefined" ) {
                                        ig.soundHandler.init( ig.soundList );
                                    }
                                    else {
                                        ig.soundHandler.init();
                                    }
                                }
                                
                                /* play static audio */
                                if ( typeof ( ig.soundHandler.sfxPlayer ) !== "undefined" ) {
                                    ig.soundHandler.sfxPlayer.play("staticSound");
                                }
                                
                                else if ( typeof ( ig.soundHandler.staticSound ) !== "undefined" ) {
                                    if ( typeof ( ig.soundHandler.staticSound.play ) === "function" ) {
                                        ig.soundHandler.staticSound.play();
                                    }
                                }
                            
                                else if ( typeof ( ig.soundHandler.playSound ) === "function" ) {
                                    ig.soundHandler.playSound("staticSound");
                                }
                            }
                            
                            else if ( typeof (Howl) !== "undefined" ) {
                                var staticSound = new Howl({src:['media/audio/play/static.ogg','media/audio/play/static.mp3']});
                                staticSound.play();
                            }
                            
                            else if ( typeof ( createjs ) !== "undefined" ) {
                                if ( typeof ( createjs.Sound ) !== "undefined" && typeof ( createjs.Sound.play ) === "function" ) {
                                    createjs.Sound.play('opening');
                                }
                            }
                            
                        } catch (error) {
                            console.log(error);
                        }
                        
                        /* hide DIV */
                        this.setAttribute("style", "display: block; visibility: hidden;");
        
                        /* end function */
                        if ( typeof (onClickCallbackFunction) === "function" ) {
                            onClickCallbackFunction();
                        }
                        
                        /* play game */
                        ig.system.setGame(MyGame);
                    });
                    
                }
            })
        });    
    }
}