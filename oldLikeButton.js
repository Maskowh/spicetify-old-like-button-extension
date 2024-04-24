// NAME: Old Like Button
// AUTHOR: Maskowh
// DESCRIPTION: Adds a button to the tracklist to add/remove a song from Liked Songs.
// Heavily inspired of https://github.com/ohitstom/spicetify-extensions/tree/main/quickQueue, especially for rendering

let likedTrackURIs = [];
var proxyArray;

var arrayChangeEvent = new CustomEvent('arrayChange');

async function initiateLikedSongs() {
    if (
        !(
            Spicetify.CosmosAsync
        )
    ) {
        setTimeout(initiateLikedSongs, 10);
        return;
    }
    let likedTracks = await Spicetify.CosmosAsync.get("sp://core-collection/unstable/@/list/tracks/all?responseFormat=protobufJson");
    likedTrackURIs = likedTracks.item.map(item => item.trackMetadata.link);
    proxyArray = new Proxy(likedTrackURIs, {
        get: function (target, property, receiver) {
            // If the accessed property is a function and it's one of the methods I want to trigger an event for
            if (['push', 'splice'].includes(property) && typeof target[property] === 'function') {
                return function (...args) {
                    // Original method call
                    const result = target[property].apply(target, args);
                    // Trigger the event to notify the buttons
                    document.dispatchEvent(arrayChangeEvent);
                    return result;
                };
            }
            // If the accessed property is not one of the intercepted methods, return the property as usual
            return Reflect.get(target, property, receiver);
        }
    });

    // This is to initiate the buttons, then to refresh it every 30 seconds to handle new/removed likes from other sources (mobile, web browser)
    document.dispatchEvent(arrayChangeEvent);
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
            Spicetify.CosmosAsync
        )
    ) {
        setTimeout(quickLike, 10);
        return;
    }

    const LikeButton = Spicetify.React.memo(function LikeButton({ uri, classList }) {

        const [isLiked, setIsLiked] = Spicetify.React.useState(likedTrackURIs.includes(uri));
        const [isHovered, setIsHovered] = Spicetify.React.useState(false);
        const buttonRef = Spicetify.React.useRef(null);

        // Initialize tippy
	Spicetify.React.useEffect(() => {
		if (buttonRef.current) {
			const tippyInstance = Spicetify.Tippy(buttonRef.current, {
				...Spicetify.TippyProps,
				hideOnClick: true,
				content: isLiked ? "Remove from Liked Songs" : "Add to Liked Songs" 
			});

			return () => {
				tippyInstance.destroy();
			};
		}
	}, [isLiked]);
        
        // When the Liked Tracks list notify of a change, we set the new value
        document.addEventListener('arrayChange', function (event) {
            setIsLiked(likedTrackURIs.includes(uri));
        });

        const handleClick = async function () {
            Spicetify.showNotification(isLiked ? "Removed from Liked Songs" : "Added to Liked Songs");
            if (isLiked) {
                try {
                    await Spicetify.CosmosAsync.del(`https://api.spotify.com/v1/me/tracks?ids=${uri.replace("spotify:track:", "")}`);
                } catch (error) {
                    if (error instanceof SyntaxError && error.message === 'Unexpected end of JSON input') {
                        // Might happen since the response from this endpoint is empty, but ignore it
                    } else {
                        console.error(error);
                    }
                }
                proxyArray.splice(proxyArray.indexOf(uri), 1);
            } else {
                try {
                    await Spicetify.CosmosAsync.put(`https://api.spotify.com/v1/me/tracks?ids=${uri.replace("spotify:track:", "")}`);
                } catch (error) {
                    if (error instanceof SyntaxError && error.message === 'Unexpected end of JSON input') {
                        // Might happen since the response from this endpoint is empty, but ignore it
                    } else {
                        console.error(error);
                    }
                }
                proxyArray.push(uri);
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
                "aria-checked": isLiked,
                onClick: handleClick,
                onMouseOver: handleMouseOver,
                onMouseOut: handleMouseOut,
                style: {
                    marginRight: "12px",
                    opacity: isLiked ? "1" : undefined
                }
            },
            Spicetify.React.createElement(
                "span",
                { className: "Wrapper-sm-only Wrapper-small-only" },
                Spicetify.React.createElement("svg", {
                    role: "img",
                    height: "24",
                    width: "24",
                    viewBox: "0 0 24 24",
                    className: isLiked ? "Svg-img-icon-small-textBrightAccent" : "Svg-img-icon-small",
                    style: {
                        fill: isLiked ? undefined : "var(--text-subdued)"
                    },
                    dangerouslySetInnerHTML: {
                        __html: isLiked
                            ? (isHovered ? `<path d="M19.5 10c-2.483 0-4.5 2.015-4.5 4.5s2.017 4.5 4.5 4.5 4.5-2.015 4.5-4.5-2.017-4.5-4.5-4.5zm2.5 5h-5v-1h5v1zm-6.527 4.593c-1.108 1.086-2.275 2.219-3.473 3.407-6.43-6.381-12-11.147-12-15.808 0-6.769 8.852-8.346 12-2.944 3.125-5.362 12-3.848 12 2.944 0 .746-.156 1.496-.423 2.253-1.116-.902-2.534-1.445-4.077-1.445-3.584 0-6.5 2.916-6.5 6.5 0 2.063.97 3.901 2.473 5.093z"></path>` : `<path d="M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z"/></path>`)
                            : `<path d="M19.5 10c-2.483 0-4.5 2.015-4.5 4.5s2.017 4.5 4.5 4.5 4.5-2.015 4.5-4.5-2.017-4.5-4.5-4.5zm2.5 5h-2v2h-1v-2h-2v-1h2v-2h1v2h2v1zm-6.527 4.593c-1.108 1.086-2.275 2.219-3.473 3.407-6.43-6.381-12-11.147-12-15.808 0-4.005 3.098-6.192 6.281-6.192 2.197 0 4.434 1.042 5.719 3.248 1.279-2.195 3.521-3.238 5.726-3.238 3.177 0 6.274 2.171 6.274 6.182 0 .746-.156 1.496-.423 2.253-.527-.427-1.124-.768-1.769-1.014.122-.425.192-.839.192-1.239 0-2.873-2.216-4.182-4.274-4.182-3.257 0-4.976 3.475-5.726 5.021-.747-1.54-2.484-5.03-5.72-5.031-2.315-.001-4.28 1.516-4.28 4.192 0 3.442 4.742 7.85 10 13l2.109-2.064c.376.557.839 1.048 1.364 1.465z"></path>`
                    }
                })
            )
        );
    });

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

    const observer = new MutationObserver(function (mutationList) {
        mutationList.forEach(mutation => {
            const node = mutation.addedNodes[0];
            if (node?.attributes?.role?.value === "row") {
                const lastRowSection = node.firstChild.lastChild; // last column of the tracklist
                const entryPoint = lastRowSection.querySelector(":scope > button:not(:last-child)"); // first element of that last column, should be the "Add to Playlist" button
                if (
                    entryPoint &&
                    (entryPoint.classList.contains("main-trackList-rowHeartButton") || entryPoint.classList.contains("main-trackList-curationButton"))
                ) {
                    const reactProps = Object.keys(node).find(k => k.startsWith("__reactProps$"));
                    const uri = findVal(node[reactProps], "uri");

                    const likeButtonWrapper = document.createElement("div");
                    likeButtonWrapper.className = "likeControl-wrapper";
                    likeButtonWrapper.style.display = "contents";
                    likeButtonWrapper.style.marginRight = 0;

                    // Add the new element before the "Add to Playlist" button
                    const likeButtonElement = lastRowSection.insertBefore(likeButtonWrapper, entryPoint);
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

    observer.observe(document, {
        subtree: true,
        childList: true
    });
})();
