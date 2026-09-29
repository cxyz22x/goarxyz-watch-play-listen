/**
    * Fullscreen Patch by Afif
    * 
    * dependency : 
    * - size-handler
    * - dom-handler
    * - director
    */
var fullscreenPatchTrialCount = 0;
var fullscreenPatchIsOlderEngine = false;
var hasInitfullscreenPatch = false;
var hasInjectedFullscreenPatchDirector = false;
var hasInjectedFullscreenPatchSizeHandler = false;
var fullscreenPatchOldSizeHandler = null;
var initFullscreenPatch = function () {
    if (typeof (ig) !== "undefined") {
        if (!hasInitfullscreenPatch) {
            hasInitfullscreenPatch = true;
            ig.module('plugins.fullscreen-patch').requires().defines(function () {
                ig.FullscreenPatch = {
                    _isEnabled: "notChecked",
                    isEnabled: function () {
                        if (this._isEnabled == "notChecked") {
                            this._isEnabled = (
                                document.fullscreenEnabled ||
                                document.mozFullScreenEnabled ||
                                document.webkitFullscreenEnabled ||
                                document.msFullscreenEnabled
                            ) ? true : false;

                        }

                        if (!(hasInitfullscreenPatch && hasInjectedFullscreenPatchDirector && hasInjectedFullscreenPatchSizeHandler)) return false;
                        return this._isEnabled;

                    },

                    isFullscreen: function () {
                        if (ig.FullscreenPatch.isEnabled() && (
                            document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement
                        )) return true;
                        return false;
                    },

                    toggleFullscreen: function () {
                        if (!ig.FullscreenPatch.isFullscreen()) {
                            ig.FullscreenPatch.requestFullscreen();
                            ig.FullscreenPatch.setButtonExit();

                        } else {
                            ig.FullscreenPatch.exitFullscreen();
                            ig.FullscreenPatch.setButtonEnter();
                        }
                        if (!fullscreenPatchIsOlderEngine) ig.sizeHandler.orientationDelayHandler();
                    },

                    requestFullscreen: function () {
                        var elem = document.documentElement;
                        if (elem.requestFullscreen) {
                            elem.requestFullscreen();
                            return;
                        }
                        if (elem.webkitRequestFullscreen) {
                            elem.webkitRequestFullscreen();
                            return;
                        }
                        if (elem.mozRequestFullScreen) {
                            elem.mozRequestFullScreen();
                            return;
                        }
                        if (elem.msRequestFullscreen) {
                            elem.msRequestFullscreen();
                            return;
                        }
                        console.log("no request fullscreen method available")
                    },

                    exitFullscreen: function () {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                            return;
                        }
                        if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                            return;
                        }
                        if (document.mozCancelFullScreen) {
                            document.mozCancelFullScreen();
                            return;
                        }
                        if (document.msExitFullscreen) {
                            document.msExitFullscreen();
                            return;
                        }
                        console.log("no exit fullscreen method available")
                    },

                    divData: null,

                    hideButton() {
                        var divData = ig.FullscreenPatch.divData;
                        if (ig.FullscreenPatch.divData) {
                            if (fullscreenPatchIsOlderEngine) {
                                $('#' + divData.id).css('visibility', 'hidden');
                            } else {
                                var elem = ig.domHandler.getElementById(divData.id);
                                ig.domHandler.hide(elem);
                            }
                        }
                    },

                    showButton(x, y, width, height) {
                        var divData = ig.FullscreenPatch.divData;
                        if (divData == null) {
                            divData = ig.FullscreenPatch.divData = {
                                id: "fullscreen-patch-button"
                            }
                            if (fullscreenPatchIsOlderEngine) ig.FullscreenPatch.createClickableOutboundLayerForOlderEngine();
                            else ig.FullscreenPatch.createClickableOutboundLayer();
                        } else {
                            if (fullscreenPatchIsOlderEngine) {
                                $('#' + divData.id).css('visibility', 'visible');
                            } else {
                                var elem = ig.domHandler.getElementById(divData.id);
                                ig.domHandler.show(elem);
                                ig.domHandler.attr(elem, 'onclick', "ig.FullscreenPatch.toggleFullscreen()");
                            }
                        }

                        divData.x = x;
                        divData.y = y;
                        divData.width = width;
                        divData.height = height;
                        if (fullscreenPatchIsOlderEngine) ig.FullscreenPatch.repositionButtonForOlderEngine();
                        else ig.FullscreenPatch.repositionButton();
                    },

                    currentButton: "",

                    setButtonEnter: function () {
                        if (ig.FullscreenPatch.currentButton == "enter") return;
                        ig.FullscreenPatch.currentButton = "enter";
                        ig.FullscreenPatch.setButtonImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAMAAABHPGVmAAABMlBMVEWfn5/Y2NimpqbIyMikpKTNzc39/f2pqanPz8/V1dXOzs6srKzQ0NDS0tLDw8OxsbHMzMyrq6vAwMCvr6/Kysqzs7O3t7eioqKoqKjGxsa5ubnX19fHx8fFxcWtra2hoaEAAADU1NS9vb3CwsK7u7vW1tbT09Pp6ena2tq/v7/t7e21tbWdnZ3r6+v19fXv7++bm5v6+vrd3d3b29vw8PDZ2dnn5+f+/v7Pz8/x8fHs7OzCwsL7+/vn5+eampr39/fy8vLg4ODS0tLLy8vIyMj09PTl5eXe3t7ExMTi4uL+/v7k5OT////////////////////////////////////////////////////////////////////////////////////////////////////////2TAMpAAAAZXRSTlOTxZe0lrj7mrrCupy7va+ft5usnrahpJWZsabEsrCdlADAqa6ow77gyavko5Dh8OiO9s7P6cjf/cLq47P43Y3x69PGwLjt2tG21fzYK78Z8Ojg29OHVKud47J/cnBhRDcUl4t4dJ/m6T4AAAksSURBVGje7drpetJAFAbgEJYAgUIImwSCLGlBsAUqrVoRW0trrfu+73P/t+CZhcxMNvd/fvrYRwjz9mQISc6gXGT59Pzzk7vo7+Xh/bf31mMz5MGbpyn0t/PoxQcRef4Y/Zu8fOAiz9A/y5N7DPmCaPZTfzOI5vE9gjyn/9tenA6EzOexmGVZjuNkfhDYBDaMxebzgZDZ2Q517mPkwWNSxSLmWG5g5E5nczOfz7Gkw8Kez+c3NzudTkYaY7ZNlG+AvEGQ1Fkm5sbiBB49y5Pk4Q9SKg8OKMC44zixW+RN9kD59BRBFhkPAa8BgI5bjAwBQWIOMHyowRRB3ivP8RG45DwloAgQyPjlcjkeFXgeS9hhDC/GOcfIC+UlKcThZTACBHf8ZkTWEjisnE7HVaw5LuWp8gTP+qm1NjodVgUQbPwLkFZY8JNUgnpwOTlSjKtcw58wCt5bqYG1rgPK4AQAePiNyFCpuWagGEHJXMI1KIgiosEIEAjQ65Ui0oNQqEkYKIYqHEEcYUYagOYFGByGHg67kH6/3x2WhsHBz8I2wyHmoCygykmu+BAHpjyXzM3O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")
                    },

                    setButtonExit: function () {
                        if (ig.FullscreenPatch.currentButton == "exit") return;
                        ig.FullscreenPatch.currentButton = "exit";
                        ig.FullscreenPatch.setButtonImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAMAAABHPGVmAAABVlBMVEWfn5/Y2NjFxcXMzMzV1dXOzs7Pz8++vr7IyMjDw8P9/f3S0tLLy8vHx8fQ0NC2tra7u7ujo6PBwcG9vb3Jycm6urrX19fAwMCxsbHBwcG5ubmysrKtra0AAAC4uLjU1NSlpaWoqKivr6+1tbWpqammpqbT09O0tLTq6ura2trt7e2rq6vx8fGenp7r6+vMzMyampr29vb8/PzPz8/6+vry8vLJycmcnJz+/v7z8/Pg4ODw8PDj4+PR0dHv7+/s7Ozm5ubLy8v4+Pjn5+fl5eXi4uLe3t7c3Nz29vb09PTZ2dnX19f////Z2dn5+fnT09P////////p6eno6Oj////////////////////e3t7///////////////////////////////////////////////////////////////////////////////////////////////8cvpT0AAAAcXRSTlOTxbC3wrm6qrSv+722srykqJWtqbWnw6yfsKahnAClwJaYnqOal7+i4cnkm+qS4sCN8fjC9+u7j/zs1ejYxOfj3b3z3trW0s7y7s7L4cb2xusp39/bwIczF825qtTSf3JhV1FEGhHFrp+dmpeLeHRxb8EhaiUAAApLSURBVGje7dpnd9JQGAdwCGXJCDuhiUESaKzB0TpAVLQWq3XvvfdWvv8bn+duCCDOFx7/PcdjIcmvz73cC7mXyE6WV88/3OyNfl+u3n9yh1+bIS8fP9ox+t25+OCFijy7OPozefdSILdHfyw3rzHkI3ugt+N3hrfZNYI8o7+tbW6tqrkUjUZrkKXvpoaJRi9dUk8/e2ZAndeI3L1IqtiM4sEYeuVGY2Ulk8nTJGaHHpDJrKw0Gg0E5SXurRHlMyCP8T87zixFRQRBLx//TqiUAYcq8jqXjpIX893Iq4f4n82lCSIDBLl+jCabzeK/LPw39iSRqAOMcqnVy3jxp5HnPewPhUcCiwCBXb1Ck5oMe5xa6HBGXG1piMiDyHtaiCyDEwSg187NCWoMYuVAo9VEKYfg6g8jN7HXt2qyDF4FCuT62ndCJXSwHHwNKEoHOyXSw25frfE6oAxGgMCA9NwwCOtBBouRytKeESQy4og0WBU5BtTrpTmpQ9LUwWqwGKaEEWEkQOAEAwzDSM4IPFUyQIKCGIOOUMIIdnk+HqtdymukodJ1fv3yvBAKCkInl9IqtdVMjCohBAuBPo83Or3Rej9NCQYUMNVpwScQog6elT/cGx06Q5UQQo1Ens4Ex+EvQwIAvPzynBAJGWw1I3GZnL9FlRBCGiu2NaI5A38aIRBwHEf3Pd3Rx4MPOrrjoAQOMOXYaXr6djyRyUCDTSBYSD6RPTXiSgEJFHSI5ZUMy/LGYy6ny6aPmgMMKNUsGphDedr5Ewjt9Up/xNN3qlVC4OW0PeuHNsuupcY8sb3j3FkfaHCAKTgpMGjWYrFEHkuZRHCAVOKnpaI7hPAt1ziEDxzVXVPEsg/Sil3L95FZ9nLn5Lk59jpuqAh7+Wa1pXV5pO8hYZnukD6wakvFdtbogxrWB4yZln/f9Vwqi2MyhGAhMJWkG1LZMi0LDeso/f2wabs8rf3soBOBiYe5dVnHDU2r0CE5jrBCKjnNyEjlrA1/s2sLxA1snvZBjjRdFwpLKkYpDUOflrKiIJcAIYXktHo5L5Xzge3agckRuxXwCORgG8oLymvinE3DSGs5Wkojc1IiUVoIGOm6UU0ckkorsAOXIR272eIp7peI3SxI41Q5WaprWqoSg7GyMoHA3FtJaVq9lCw7MUWB69ocCZoiEtkVtJcVo1qAsQ+lpLL4Kh5DoNuxR7CQZLngZxWl3ZZIewpS3KUYQ8cpkFKgV7C98vskUhOtBYXAODcrilIMONLa1eaJCKSrS+O4py9Xy0mDt9c4ks+z1jIQcXQzJZULzY5ARARyxN2WhuUDwtqrgu2VGEOgS1hrwZyoe76dW5fKgCHNokD2bvAnj0nDND2YYLC9sFNCCO+SkkEK8Swr0GQtPYGICETmjA1TDLaXfH2NIUuI4CDBLsFCYJw366ioOdaOCKS7ETICG4Y+lILtVYdSwgj2u0YQbC0LELtdv/wDSD9o2TDB+KS9SKdgz8d3qwj2O3ZJuVDF1oKJwg6KxuVxZFdEpHtkwmg2A5g/sb14p1SyYUTpEhDsVrPZjlS31Qt1du3F6xfxnwNjSO9Csdhswuxguz7vFOz5cSShILpZ39rcPIXpD8YqKQICCSPrZ4Z4+OaN4UHdh06Zj2C/+wfX5ekLIWr2VXXs+elIliN6HYyfRvC9jr688DWciE1Hqv6FWad3VGRj1lFrZWcB5Oys0wcLVXI6ORuJpRiip2advr8bEdnbOjrjqE1v+fvI8qxSjkegEFmKMb3r1gy9ugCiW/v3bR89jOmIHN63HxtLVfR+Rwk5/minX7YcjmTDfSIRzzVxWrGDFo5ImHKLkMgBNNR0u/g4PN2GcUgGIsxdrqUrSHwOgkSAAF6f9AAkEspe9jCh2IC3/MURRQFmfpBot6EYrOUPIcW/gBT/V/IPVWIHzTZcHodCt9s9QLI3NEzYE90ujBakAArcRRHLOxK9cuXEiRMHIftZtOaBSUPf2L+xQZ+FA+F4OMkwPRWZPUHWO1Nnvjoq0tjVn3bU+nnfWWCCdArbo6nZ4XXVOrZG03PFXwDxroxmZKjM9d3CrOXw7cIvvTMeXujt93JyAcSD03/lg8TAmfPOyJCCo+/+FaR3hPaJpr5phT/ceU7/ED9jfTGkJ3YTOhvWnA93EnF8swBrRAZWdWMxZP2IjqtR9brhmerH1HkfuH3TtlstuOUZf5l2Zn/gPpeM4Hi3XYt/4J6B8FsHh946ANMfhZAi+0FEzeX6Lj51AWLIT/Xzb4KC4PhoAlHvTyY7/lC67ZomuQmS9yeh2zl58+vogNi2aoRv5wQilRbeabEuwVdwGFF7nnxekcbRtfCNqUAGPaHkAtpavN8FEr7FxnlYt0xpbDuDOciRg/I1lrI92SXhu98MILJTHM+XxprXPjxlsWBDLBZckC2Wghcwvy8NLxZkSKfwG3ldH0pjuWhPQ5RlD0Wp+FAIHe9y2UNdwMnK9jqlGO0WIPMWcFptRYl5Zb6Ag0hmDJHtZRQKm3KQFZp2y+XrXdOWok7sgvfq87Jf4stsdsxCa42tEl1qkPYigz6ZlMZaoeXagURaIrsEAutddqAo+YJcJFoZR6C9aCml0nVpJAPTdW3zu8uDrq0omaSGhcTI8qCCrDZYKbl0WhrnSq6FywbWNhsvpi3S5MiVlmnincZZqayUsEdw4a4xuZpKSslpu6WRNmF+QWbAVmJduZoaaGx23whMXLP1TUVZmr6ailsneUSUOjSfrj1b9gm2BGybMvaQtqgDBll99reUWlJYCF0XDq9w1+RNbE6HVXTKmDgd96KupcQsHMOjUq7P19EdqQwq2CMrk8voNSwlURkKo7IMby2E0YGJbZ3VTH8spnPizIWk6YkdgUK1L4ZLPoaFhBHclsseF0Y5WQYFGUd3dAs6V5+IBw/6urq3Ue4LJE4KmbZJk4/XetSIJUulJDLoADQ7bJuG7tIYZyiyh2zShBG2S0NKOZcoaWm+21QAaE4Q4BtBsJVHzj/diJPGmrqnhcrqvsHxmCb2zeSuVjjKjhbb0oLzVk8eG2aIMWVPSyjZLMwJdHsOHYTmBq4vNufwzEosSzpk2u6cUHDXV+xl8q1MY0bwOSoAQfdm2QiZsc8oFb5lKvZM5wSeVjdMY3T3Fw0FuYrj7Cw8JBTK4JycQodmzr4vAnLrFwxeByIDrCFyCyn8XoGqcIbuY2Nm7mCzPWx1E5sbGPwMcjHyBJHB0vQ9f2w2lOalQgF117/Gjdo9HHe3IneuYkFna1IRDHVQQguTlZG/x4hA9sh5GTxLZCH/dmTnGzKZRtkzkmEOhlwGfkTUB+IIMIEQikGnwjuRnS/oG9LqkspIBySZuPLDgtfnAhLqVYbkPec+fjnmLf3EfBzme56GLIUXE44sgxfSAEYkeo9ueqxfQ+TuTTZ1dvaoOXny5D6S3d/JPho4Xj19sMY+v36l3yW6dnH053J7JyKo3Br9oax/Ub5E9unPFHP/2k6JQMc8ffDo6u+8/o6Lt27z78N9A9Wwgrn5L5zzAAAAAElFTkSuQmCC");
                    },

                    setButtonImage: function (base64) {
                        if (fullscreenPatchIsOlderEngine) {
                            $("#" + ig.FullscreenPatch.divData.id + "-image").attr("src", base64);
                        } else {
                            var elem = ig.domHandler.getElementById("#" + ig.FullscreenPatch.divData.id + "-image");
                            ig.domHandler.attr(elem, "src", base64);
                        }
                    },

                    createClickableOutboundLayerForOlderEngine: function () {
                        var div = ig.$new('div');
                        div.id = ig.FullscreenPatch.divData.id;

                        document.body.appendChild(div);

                        $('#' + div.id).html('<a><img id=\'' + div.id + '-image' + '\' style=\'width:100%;height:100%\' src=\'\'></a>');
                        $('#' + div.id).attr("onclick", "ig.FullscreenPatch.toggleFullscreen()");

                        ig.FullscreenPatch.repositionButtonForOlderEngine();
                    },
                    createClickableOutboundLayer: function () {

                        var divData = ig.FullscreenPatch.divData;
                        var id = divData.id;
                        // CREATE LAYER
                        var div = ig.domHandler.create("div");
                        ig.domHandler.attr(div, "id", id);
                        ig.domHandler.attr(div, "onclick", "ig.FullscreenPatch.toggleFullscreen()");
                        var newLink = ig.domHandler.create('a');

                        var linkImg = ig.domHandler.create('img');

                        ig.domHandler.css(linkImg, { width: "100%", height: "100%" });
                        ig.domHandler.attr(linkImg, "src", "");
                        ig.domHandler.attr(linkImg, "id", divData.id + "-image");

                        ig.domHandler.addEvent(div, 'mousemove', ig.input.mousemove.bind(ig.input), false);

                        ig.domHandler.appendChild(newLink, linkImg);
                        ig.domHandler.appendChild(div, newLink);

                        ig.domHandler.appendToBody(div);

                        ig.FullscreenPatch.setButtonEnter();
                    },


                    repositionButtonForOlderEngine: function () {
                        var data = ig.FullscreenPatch.divData;
                        if (data == null) return;

                        if (ig.FullscreenPatch.isFullscreen()) ig.FullscreenPatch.setButtonExit();
                        else ig.FullscreenPatch.setButtonEnter();

                        var div = { id: data.id };
                        var posX = data.x;
                        var posY = data.y;
                        var sizeX = data.width;
                        var sizeY = data.height;

                        var elem = $('#' + div.id);
                        if (!elem) return;
                        $('#' + div.id).css('float', 'left');
                        $('#' + div.id).css('position', 'absolute');

                        // if (ig.ua.mobile) {//w == mobileWidth){
                        //     var heightRatio = window.innerHeight / mobileHeight;
                        //     var widthRatio = window.innerWidth / mobileWidth;
                        //     $('#' + div.id).css('left', posX * widthRatio);
                        //     $('#' + div.id).css('top', posY * heightRatio);
                        //     $('#' + div.id).css('width', sizeX * widthRatio);
                        //     $('#' + div.id).css('height', sizeY * heightRatio);
                        //     $('#' + div.id).css('z-index', '3');
                        // } else {
                        //     // PEG LAYER TO ENTITY
                        //     var reference = {
                        //         x: (w / 2) - (destW / 2),
                        //         y: (h / 2) - (destH / 2),
                        //     }

                        //     $('#' + div.id).css('left', reference.x + posX * multiplier);
                        //     $('#' + div.id).css('top', reference.y + posY * multiplier);
                        //     $('#' + div.id).css('width', sizeX * multiplier);
                        //     $('#' + div.id).css('height', sizeY * multiplier);
                        //     $('#' + div.id).css('z-index', '3');
                        // }

                        if (ig.ua.mobile) {//w == mobileWidth){
                            var heightRatio = window.innerHeight / mobileHeight;
                            var widthRatio = window.innerWidth / mobileWidth;
                            $('#' + div.id).css('left', posX * widthRatio);
                            $('#' + div.id).css('top', posY * heightRatio);
                            $('#' + div.id).css('width', sizeX * widthRatio);
                            $('#' + div.id).css('height', sizeY * heightRatio);
                            $('#' + div.id).css('z-index', '3');
                        } else {
                            var offsetLeft = document.getElementById('game').offsetLeft;
                            var offsetTop = document.getElementById('game').offsetTop;
                            $('#' + div.id).css('left', offsetLeft + posX * multiplier);
                            $('#' + div.id).css('top', offsetTop + posY * multiplier);
                            $('#' + div.id).css('width', sizeX * multiplier);
                            $('#' + div.id).css('height', sizeY * multiplier);
                            $('#' + div.id).css('z-index', '3');
                        }

                    },

                    repositionButton: function () {

                        var data = ig.FullscreenPatch.divData;
                        if (!data) return;

                        if (ig.FullscreenPatch.isFullscreen()) ig.FullscreenPatch.setButtonExit();
                        else ig.FullscreenPatch.setButtonEnter();

                        var aspectRatioMin = Math.min(ig.sizeHandler.scaleRatioMultiplier.x, ig.sizeHandler.scaleRatioMultiplier.y);
                        var div = ig.domHandler.getElementById("#" + data.id);
                        var posX = data.x;
                        var posY = data.y;
                        var sizeX = data.width;
                        var sizeY = data.height;

                        var canvas = ig.domHandler.getElementById("#canvas");

                        var offsets = ig.domHandler.getOffsets(canvas);

                        if (ig.ua.mobile) {
                            console.log("adjustMobile");

                            var offsetLeft = offsets.left;
                            var offsetTop = offsets.top;

                            if (ig.sizeHandler.disableStretchToFitOnMobileFlag) {
                                var divleft = Math.floor(offsetLeft + posX * ig.sizeHandler.scaleRatioMultiplier.x) + "px";
                                var divtop = Math.floor(offsetTop + posY * ig.sizeHandler.scaleRatioMultiplier.y) + "px";
                                var divwidth = Math.floor(sizeX * ig.sizeHandler.scaleRatioMultiplier.x) + "px";
                                var divheight = Math.floor(sizeY * ig.sizeHandler.scaleRatioMultiplier.y) + "px";
                            } else {
                                var divleft = Math.floor(posX * ig.sizeHandler.sizeRatio.x) + "px";
                                var divtop = Math.floor(posY * ig.sizeHandler.sizeRatio.y) + "px";
                                var divwidth = Math.floor(sizeX * ig.sizeHandler.sizeRatio.x) + "px";
                                var divheight = Math.floor(sizeY * ig.sizeHandler.sizeRatio.y) + "px";
                            }

                            ig.domHandler.css(div
                                , {
                                    float: "left"
                                    , position: "absolute"
                                    , left: divleft
                                    , top: divtop
                                    , width: divwidth
                                    , height: divheight
                                    , "z-index": 3
                                }
                            );
                        }
                        else {
                            var offsetLeft = offsets.left;
                            var offsetTop = offsets.top;

                            var divleft = Math.floor(offsetLeft + posX * aspectRatioMin) + "px";
                            var divtop = Math.floor(offsetTop + posY * aspectRatioMin) + "px";
                            var divwidth = Math.floor(sizeX * aspectRatioMin) + "px";
                            var divheight = Math.floor(sizeY * aspectRatioMin) + "px";

                            ig.domHandler.css(div
                                , {
                                    float: "left"
                                    , position: "absolute"
                                    , left: divleft
                                    , top: divtop
                                    , width: divwidth
                                    , height: divheight
                                    , "z-index": 3
                                }
                            );
                        }
                    }
                };

            });
        }
        if (typeof (ig.Director) !== "undefined" && !hasInjectedFullscreenPatchDirector) {
            hasInjectedFullscreenPatchDirector = true;
            ig.Director.inject({
                loadLevel: function (levelNumber) {
                    if (typeof (fullscreenPatchButtonPlacements) !== "undefined" && ig.FullscreenPatch.isEnabled()) {
                        for (var key in fullscreenPatchButtonPlacements) {
                            var placement = fullscreenPatchButtonPlacements[key];
                            if (placement.levelNumber == levelNumber) {
                                ig.FullscreenPatch.showButton(placement.x, placement.y, placement.width, placement.height);
                                return this.parent(levelNumber);
                            }
                        }
                        ig.FullscreenPatch.hideButton();
                    }
                    return this.parent(levelNumber);
                }
            });
        }
        if (!hasInjectedFullscreenPatchSizeHandler) {
            if (typeof (ig.SizeHandler) !== "undefined") {
                console.log("newer game framework detected...");
                hasInjectedFullscreenPatchSizeHandler = true;
                ig.SizeHandler.inject({
                    resize: function () {
                        this.parent();
                        ig.FullscreenPatch.repositionButton();
                    }
                });
            } else if (typeof (adjustLayers) == "function") {
                console.log("older game framework detected...");
                fullscreenPatchIsOlderEngine = true;
                hasInjectedFullscreenPatchSizeHandler = true;
                fullscreenPatchOldSizeHandler = adjustLayers;
                adjustLayers = function (width, height) {
                    fullscreenPatchOldSizeHandler.apply(this, arguments);
                    // console.log("adjusting fullscreen button div...")
                    ig.FullscreenPatch.repositionButtonForOlderEngine();
                }

            }
        }
    }

    if (!(hasInitfullscreenPatch && hasInjectedFullscreenPatchDirector && hasInjectedFullscreenPatchSizeHandler)) {
        if (!hasInitfullscreenPatch) console.log("no ig")
        else {
            if (!hasInjectedFullscreenPatchDirector) console.log("no ig.Director")
            if (!hasInjectedFullscreenPatchSizeHandler) console.log("no ig.SizeHandler or handler plugin")
        }

        if (fullscreenPatchTrialCount < 10) {
            console.log("try again in 1000ms...")
            window.setTimeout(function () { initFullscreenPatch() }.bind(this), 1000);
            fullscreenPatchTrialCount++;
        } else {
            console.log("ALERT : This game framework is not supported by the fullscreen patch!")
        }
    }
};

initFullscreenPatch();