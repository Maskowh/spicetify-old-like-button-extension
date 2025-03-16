// NAME: Old Like Button
// AUTHOR: Maskowh, OhItsTom
// DESCRIPTION: Adds a button to the tracklist to add/remove a song from Liked Songs.
// Heavily inspired of https://github.com/ohitstom/spicetify-extensions/tree/main/quickQueue, especially for rendering


let likedTracksIdsISRCs = new Map(); // ids/isrcs of all liked tracks, to check if we should display the heart icon or not. 
let likedTracksISRCs = new Set(likedTracksIdsISRCs.values()); // isrcs of all liked tracks, to check if we should display the half-heart icon or not

var proxyLikedTracksIdsISRCs; // proxy for likedTracksIds, to trigger an event on add/delete

var likedTracksChangeEvent = new CustomEvent('likedTracksChange');

async function initiateLikedSongs() {
    if (
        !(
            Spicetify.CosmosAsync
        )
    ) {
        setTimeout(initiateLikedSongs, 10);
        return;
    }
    let likedTracksItems = await Spicetify.CosmosAsync.get("sp://core-collection/unstable/@/list/tracks/all?responseFormat=protobufJson");
    let likedTracksIds = likedTracksItems.item.map(item => item.trackMetadata.link.replace("spotify:track:", ""));

    let newLikedTracksIdsISRCs = new Map();
    let likedTracksIdsWithUnknownISRCs = [];

    likedTracksIds.forEach(trackId => {
        const trackIsrc = localStorage.getItem("maskowh-oldlike-" + trackId)
        if (trackIsrc != null) {
            newLikedTracksIdsISRCs.set(trackId, trackIsrc)
        } else if (!trackId.startsWith("spotify:local:")) {
            likedTracksIdsWithUnknownISRCs.push(trackId);
        }
    });

    let promises = [];

    for (let i = 0; i < likedTracksIdsWithUnknownISRCs.length; i += 50) {
        let batch = likedTracksIdsWithUnknownISRCs.slice(i, i + 50);
        console.info("Requesting ISRCs for the following liked tracks: " + batch);
        promises.push(
            Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/tracks?ids=${batch.join(",")}`).then(response => {
                response.tracks.forEach(track => {
                    newLikedTracksIdsISRCs.set(track.id, track.external_ids.isrc);
                    localStorage.setItem("maskowh-oldlike-" + track.id, track.external_ids.isrc);
                });
            })
        );
    }

    await Promise.all(promises);

    likedTracksIdsISRCs = newLikedTracksIdsISRCs;
    likedTracksISRCs = new Set(likedTracksIdsISRCs.values());

    proxyLikedTracksIdsISRCs = new Proxy(likedTracksIdsISRCs, {
        get: function (target, property, receiver) {
            // If the accessed property is a function and it's one of the methods I want to trigger an event for
            if (['set', 'delete'].includes(property) && typeof target[property] === 'function') {
                return function (...args) {
                    // Original method call
                    const result = target[property].apply(target, args);
                    // Trigger the event to notify the buttons
                    likedTracksISRCs = new Set(likedTracksIdsISRCs.values());
                    document.dispatchEvent(likedTracksChangeEvent);
                    return result;
                };
            }
            // If the accessed property is not one of the intercepted methods, return the property as usual
            return Reflect.get(target, property, receiver);
        }
    });

    // This is to initiate the buttons, then to refresh it every 30 seconds to handle new/removed likes from other sources (mobile, web browser)
    document.dispatchEvent(likedTracksChangeEvent);
    setTimeout(initiateLikedSongs, 30000);
}

initiateLikedSongs();

(function quickLike() {
    if (
        !(
            Spicetify.React &&
            Spicetify.ReactDOM &&
            Spicetify.SVGIcons &&
            Spicetify.showNotification &&
            Spicetify.Platform.PlayerAPI &&
            Spicetify.Tippy &&
            Spicetify.TippyProps &&
            Spicetify.CosmosAsync &&
            Spicetify.Player &&
            Spicetify.Player.data
        )
    ) {
        setTimeout(quickLike, 10);
        return;
    }

    const LikeButton = Spicetify.React.memo(function LikeButton({ uri, classList }) {

        const trackId = uri.replace("spotify:track:", "");
        const [isrc, setISRC] = Spicetify.React.useState(localStorage.getItem("maskowh-oldlike-" + trackId));
        const [isLiked, setIsLiked] = Spicetify.React.useState(likedTracksIdsISRCs.has(trackId));
        const [hasISRCLiked, setHasISRCLiked] = Spicetify.React.useState(likedTracksISRCs.has(isrc));
        const [isHovered, setIsHovered] = Spicetify.React.useState(false);
        const buttonRef = Spicetify.React.useRef(null);

        Spicetify.React.useEffect(() => {
            // Initialize tippy
            if (buttonRef.current) {
                const tippyInstance = Spicetify.Tippy(buttonRef.current, {
                    ...Spicetify.TippyProps,
                    hideOnClick: true,
                    content: isLiked ? "Remove from Liked Songs" : hasISRCLiked ? "Add to Liked Songs (You already like another version of the exact same recording)" : "Add to Liked Songs"
                });

                return () => {
                    tippyInstance.destroy();
                };
            }
        }, [isLiked, hasISRCLiked]);

        Spicetify.React.useEffect(() => {
            async function initISRC() {
                try {
                    // If the ISRC is not in known ISRCs, request the track to spotify api to get the isrc and store it in local storage
                    if (isrc == null) {
                        console.log("Requesting the isrc for " + trackId)
                        let track = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/tracks/${trackId}`);
                        setISRC(track.external_ids.isrc);
                        localStorage.setItem("maskowh-oldlike-" + track.id, track.external_ids.isrc);
                        setHasISRCLiked(likedTracksISRCs.has(track.external_ids.isrc));
                    } else {
                        setHasISRCLiked(likedTracksISRCs.has(isrc));
                    }
                } catch (error) {
                    console.error('Error fetching data:', error);
                }
            };

            initISRC();
        }, [isLiked, hasISRCLiked]);

        // When the Liked Tracks list notify of a change, we set the new values
        document.addEventListener('likedTracksChange', function (event) {
            setIsLiked(likedTracksIdsISRCs.has(trackId));
            setHasISRCLiked(likedTracksISRCs.has(isrc));
        });

        const handleClick = async function () {
            Spicetify.showNotification(isLiked ? "Removed from Liked Songs" : "Added to Liked Songs");
            if (isLiked) {
                try {
                    await Spicetify.CosmosAsync.del(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`);
                } catch (error) {
                    if (error instanceof SyntaxError && error.message === 'Unexpected end of JSON input') {
                        // Might happen since the response from this endpoint is empty, but ignore it
                    } else {
                        console.error(error);
                    }
                }
                proxyLikedTracksIdsISRCs.delete(trackId);
            } else {
                try {
                    await Spicetify.CosmosAsync.put(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`);
                } catch (error) {
                    if (error instanceof SyntaxError && error.message === 'Unexpected end of JSON input') {
                        // Might happen since the response from this endpoint is empty, but ignore it
                    } else {
                        console.error(error);
                    }
                }
                if (isrc === "") {
                    console.error("Track without isrc set. Shouldn't happen")
                } else {
                    proxyLikedTracksIdsISRCs.set(trackId, isrc);
                }
            }
        };

        const handleMouseOver = function () {
            setIsHovered(true);
        }

        const handleMouseOut = function () {
            setIsHovered(false);
        }

        // Render
        return Spicetify.React.createElement(
            "button",
            {
                ref: buttonRef,
                className: classList,
                "aria-checked": isLiked || hasISRCLiked,
                onClick: handleClick,
                onMouseOver: handleMouseOver,
                onMouseOut: handleMouseOut,
                style: {
                    marginRight: "12px",
                    opacity: (isLiked || hasISRCLiked) ? "1" : undefined
                }
            },
            Spicetify.React.createElement(
                "span",
                { className: "Wrapper-sm-only Wrapper-small-only" },
                Spicetify.React.createElement("svg", {
                    role: "img",
                    height: "16",
                    width: "16",
                    viewBox: "0 0 24 24",
                    className: (isLiked || hasISRCLiked) ? "Svg-img-icon-small-textBrightAccent" : "Svg-img-icon-small",
                    style: {
                        fill: (isLiked || hasISRCLiked) ? "var(--text-bright-accent)" : "var(--text-subdued)"
                    },
                    dangerouslySetInnerHTML: {
                        __html: isLiked
                            ? (isHovered
                                ? `<path d="M19.5 10c-2.483 0-4.5 2.015-4.5 4.5s2.017 4.5 4.5 4.5 4.5-2.015 4.5-4.5-2.017-4.5-4.5-4.5zm2.5 5h-5v-1h5v1zm-6.527 4.593c-1.108 1.086-2.275 2.219-3.473 3.407-6.43-6.381-12-11.147-12-15.808 0-6.769 8.852-8.346 12-2.944 3.125-5.362 12-3.848 12 2.944 0 .746-.156 1.496-.423 2.253-1.116-.902-2.534-1.445-4.077-1.445-3.584 0-6.5 2.916-6.5 6.5 0 2.063.97 3.901 2.473 5.093z"></path>`
                                : `<path d="M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z"/></path>`)
                            : (hasISRCLiked
                                ? (isHovered
                                    ? `<path d="M 4.851562 1.148438 C 1.820312 1.808594 -0.191406 4.480469 0.0390625 7.550781 C 0.148438 9.109375 0.640625 10.339844 1.839844 12.148438 C 2.980469 13.859375 4.230469 15.25 8.261719 19.300781 L 12 23.050781 L 13.710938 21.328125 L 15.429688 19.621094 L 14.78125 18.910156 C 13.679688 17.730469 13.128906 16.449219 13.039062 14.851562 C 12.839844 11.730469 15.078125 8.789062 18.148438 8.148438 C 19.871094 7.789062 21.910156 8.199219 23.171875 9.160156 C 23.339844 9.289062 23.511719 9.398438 23.539062 9.398438 C 23.660156 9.398438 23.910156 8.300781 23.96875 7.550781 C 24.148438 5.050781 22.859375 2.75 20.699219 1.730469 C 20.230469 1.5 19.640625 1.269531 19.378906 1.210938 C 17.539062 0.78125 15.570312 1.109375 14.019531 2.121094 C 13.390625 2.53125 12.550781 3.371094 12.230469 3.910156 C 12.140625 4.070312 12.03125 4.199219 12 4.199219 C 11.96875 4.199219 11.800781 3.96875 11.609375 3.691406 C 10.878906 2.621094 9.621094 1.730469 8.25 1.300781 C 7.328125 1.011719 5.800781 0.949219 4.851562 1.148438 Z M 8.988281 3.949219 C 10.101562 4.238281 11.179688 4.980469 11.78125 5.871094 L 12 6.179688 L 11.980469 13.191406 L 11.949219 20.210938 L 9.5 17.769531 C 7.328125 15.621094 6.578125 14.828125 5.410156 13.5 C 4.558594 12.53125 3.609375 10.921875 3.261719 9.851562 C 3 9.050781 2.949219 8.050781 3.148438 7.300781 C 3.589844 5.589844 4.539062 4.570312 6.25 3.988281 C 6.878906 3.78125 8.269531 3.75 8.988281 3.949219 Z M 8.988281 3.949219"/></path><path d="M 18.449219 10.140625 C 17.621094 10.339844 16.988281 10.699219 16.339844 11.339844 C 14.570312 13.121094 14.570312 15.878906 16.339844 17.660156 C 18.121094 19.429688 20.878906 19.429688 22.660156 17.660156 C 24.429688 15.878906 24.429688 13.121094 22.660156 11.339844 C 21.519531 10.210938 19.980469 9.769531 18.449219 10.140625 Z M 20 13 L 20 14 L 22 14 L 22 15 L 20 15 L 20 17 L 19 17 L 19 15 L 17 15 L 17 14 L 19 14 L 19 12 L 20 12 Z M 20 13"/></path>`
                                    : `<path d="M 5.449219 1.058594 C 5.339844 1.078125 5 1.148438 4.699219 1.210938 C 4.398438 1.269531 3.769531 1.5 3.300781 1.71875 C 0.710938 2.960938 -0.550781 5.949219 0.261719 8.949219 C 0.648438 10.410156 1.851562 12.390625 3.550781 14.398438 C 4.089844 15.03125 6.210938 17.238281 8.269531 19.300781 L 12 23.050781 L 15.730469 19.300781 C 19.769531 15.25 21.019531 13.859375 22.160156 12.148438 C 23.359375 10.339844 23.851562 9.109375 23.960938 7.550781 C 24.199219 4.410156 22.148438 1.761719 19 1.140625 C 16.480469 0.640625 13.738281 1.699219 12.390625 3.691406 C 12.199219 3.96875 12.03125 4.199219 12 4.199219 C 11.96875 4.199219 11.871094 4.070312 11.769531 3.910156 C 11.238281 3.011719 10 1.988281 8.871094 1.53125 C 7.839844 1.109375 6.28125 0.898438 5.449219 1.058594 Z M 9.289062 4.039062 C 9.691406 4.171875 10.269531 4.449219 10.570312 4.660156 C 11.160156 5.070312 11.859375 5.871094 11.949219 6.230469 C 11.980469 6.351562 11.988281 9.550781 11.980469 13.351562 L 11.949219 20.25 L 9.140625 17.449219 C 5.28125 13.589844 4.019531 12.011719 3.269531 10.050781 C 3.121094 9.660156 3.070312 9.28125 3.070312 8.351562 C 3.058594 7.179688 3.070312 7.128906 3.410156 6.398438 C 3.929688 5.300781 4.898438 4.441406 6.050781 4.050781 C 6.679688 3.839844 6.800781 3.820312 7.699219 3.808594 C 8.359375 3.800781 8.730469 3.859375 9.289062 4.039062 Z M 9.289062 4.039062"/></path>`)
                                : `<path d="M19.5 10c-2.483 0-4.5 2.015-4.5 4.5s2.017 4.5 4.5 4.5 4.5-2.015 4.5-4.5-2.017-4.5-4.5-4.5zm2.5 5h-2v2h-1v-2h-2v-1h2v-2h1v2h2v1zm-6.527 4.593c-1.108 1.086-2.275 2.219-3.473 3.407-6.43-6.381-12-11.147-12-15.808 0-4.005 3.098-6.192 6.281-6.192 2.197 0 4.434 1.042 5.719 3.248 1.279-2.195 3.521-3.238 5.726-3.238 3.177 0 6.274 2.171 6.274 6.182 0 .746-.156 1.496-.423 2.253-.527-.427-1.124-.768-1.769-1.014.122-.425.192-.839.192-1.239 0-2.873-2.216-4.182-4.274-4.182-3.257 0-4.976 3.475-5.726 5.021-.747-1.54-2.484-5.03-5.72-5.031-2.315-.001-4.28 1.516-4.28 4.192 0 3.442 4.742 7.85 10 13l2.109-2.064c.376.557.839 1.048 1.364 1.465z"></path>`)
                    }
                })
            )
        );
    });


    // Paybar button insertion
    function waitForWidgetMounted() {
        nowPlayingWidget = document.querySelector(".main-nowPlayingWidget-nowPlaying");
        entryPoint = document.querySelector(".main-nowPlayingWidget-nowPlaying [data-encore-id='buttonTertiary']");
        if (!(nowPlayingWidget && entryPoint)) {
            setTimeout(waitForWidgetMounted, 300);
            return;
        }

        const likeButtonWrapper = document.createElement("div");
        likeButtonWrapper.className = "likeControl-wrapper";

        renderLikeButton(likeButtonWrapper);
    }

    (function attachObserver() {
        const leftPlayer = document.querySelector(".main-nowPlayingBar-left");
        if (!leftPlayer) {
            setTimeout(attachObserver, 300);
            return;
        }
        waitForWidgetMounted();
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.removedNodes.length > 0) {
                    const removedNodes = Array.from(mutation.removedNodes);
                    const isNowPlayingRemoved = removedNodes.some(node => node.classList && node.classList.contains("main-nowPlayingWidget-nowPlaying"));
                    if (isNowPlayingRemoved) {
                        waitForWidgetMounted();
                    }
                }
            });
        });
        observer.observe(leftPlayer, { childList: true });
    })();

    function renderLikeButton(container) {
        const uri = Spicetify.Player.data?.item?.uri || "";
        const entryPoint = document.querySelector(".main-nowPlayingWidget-nowPlaying [data-encore-id='buttonTertiary']");

        try {
            // Standard case
            entryPoint.parentNode.parentNode.insertBefore(container, entryPoint.nextSibling);
        } catch (error) {
            try {
                // Smart shuffle case
                entryPoint.parentNode.parentNode.parentNode.insertBefore(container, entryPoint.nextSibling);
            } catch (altError) {
                console.error("Failed to insert like button", error, altError);
                return;
            }
        }
        Spicetify.ReactDOM.render(
            Spicetify.React.createElement(LikeButton, {
                uri: uri,
                key: uri,
                classList: entryPoint.classList
            }),
            container
        );
        container.firstChild.style.marginRight = "0px";
    }

    Spicetify.Player.addEventListener("songchange", () => {
        const container = document.querySelector(".likeControl-wrapper");
        if (container) {
            renderLikeButton(container); // Re-render on song change
        }
    });


    // Main view button insertion
    function findVal(object, key, max = 10) {
        if (object[key] !== undefined || !max) {
            return object[key];
        }

        for (const k in object) {
            if (object[k] && typeof object[k] === "object") {
                const value = findVal(object[k], key, --max);
                if (value !== undefined) {
                    return value;
                }
            }
        }

        return undefined;
    }

    const observer = new MutationObserver(mutationList => {
        mutationList.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                const nodeMatch =
                    node.attributes?.role?.value === "row"
                        ? node.firstChild?.lastChild
                        : node.firstChild?.attributes?.role?.value === "row"
                            ? node.firstChild?.firstChild.lastChild
                            : null;

                if (nodeMatch) {
                    const entryPoint = nodeMatch.querySelector(":scope > button:not(:last-child):has([data-encore-id])");

                    if (entryPoint) {
                        const reactPropsKey = Object.keys(node).find(key => key.startsWith("__reactProps$"));
                        const uri = findVal(node[reactPropsKey], "uri");

                        const likeButtonWrapper = document.createElement("div");
                        likeButtonWrapper.className = "likeControl-wrapper";
                        likeButtonWrapper.style.display = "contents";
                        likeButtonWrapper.style.marginRight = 0;

                        const likeButtonElement = nodeMatch.insertBefore(likeButtonWrapper, entryPoint);
                        Spicetify.ReactDOM.render(
                            Spicetify.React.createElement(LikeButton, {
                                uri,
                                classList: entryPoint.classList
                            }),
                            likeButtonElement
                        );
                    }
                }
            });
        });
    });

    observer.observe(document, {
        subtree: true,
        childList: true
    });
})();