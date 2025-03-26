Set.prototype.intersection = function(otherSet) {
    return new Set([...this].filter(item => otherSet.has(item)));
};

// Initialize chess game
const chess = new Chess();
let moveHistory = [];
let currentPosition = -1;
let boardPosition = 'start';
let pendingPromotion = null;
let lastMove = null;
let arrows = []; // Global variable to store multiple arrows
let openingBook = null; // Global variable to store the opening book data

/*
 * openingBook format:
 * {
 *   "series": {
 *     "seriesName0": [game_ids]
 *     "seriesName1": [game_ids]
 *     ...
 *   }, 
 *   "games": {
 *     "game_id0" : [vs_str, yt_link, elo] 
 *     "game_id1" : [vs_str, yt_link, elo] 
 *     ...
 *   }
 *   "White": {  // Tree of moves for White
 *     "e2e4": {  // UCI format move
 *       "game_ids": Set<number>,  // Set of game IDs that contain this position
 *       "e7e5": {  // Next possible move
 *         "game_ids": Set<number>,
 *         // ... more moves
 *       }
 *     }
 *   },
 *   "Black": {  // Tree of moves for Black
 *     // Same structure as White
 *   }
 * }
 */

// Create promise that will resolve when book is loaded
const bookLoadedPromise = new Promise((resolve) => {
    // Load the opening book asynchronously
    fetch('book.json')
        .then(response => response.json())
        .then(data => {
            openingBook = data;
            console.log('Opening book loaded successfully');

            // Convert lists to sets
            Object.keys(openingBook.series).forEach(key => {
                openingBook.series[key] = new Set(openingBook.series[key]);
            });

            // Add "All" series containing all game IDs
            const allGameIds = new Set();
            Object.keys(openingBook.games).forEach(gameId => {
                allGameIds.add(parseInt(gameId));
            });
            openingBook.series["Any Series"] = allGameIds;

            // Convert game_ids lists to Sets for both White and Black trees
            function convertGameIdsToSets(node) {
                if (node.game_ids) {
                    node.game_ids = new Set(node.game_ids);
                }
                // Recursively convert game_ids in all child nodes
                for (let key in node) {
                    if (key !== 'game_ids' && typeof node[key] === 'object') {
                        convertGameIdsToSets(node[key]);
                    }
                }
            }

            // Convert game_ids in both trees
            convertGameIdsToSets(openingBook.White);
            convertGameIdsToSets(openingBook.Black);

            // Populate series selection
            populateSeriesSelection();
            resolve(data);
        })
        .catch(error => {
            console.error('Error loading opening book:', error);
            resolve(null); // Resolve with null on error
        });
});

// Function to populate series selection
function populateSeriesSelection() {
    const seriesSelect = document.getElementById('series-select');
    seriesSelect.innerHTML = ''; // Clear existing options

    if (openingBook && openingBook.series) {
        // First add "Any Series" option
        const anySeriesOption = document.createElement('option');
        anySeriesOption.value = "Any Series";
        anySeriesOption.textContent = "Any Series";
        seriesSelect.appendChild(anySeriesOption);

        // Then add all other series
        Object.keys(openingBook.series).forEach(seriesName => {
            if (seriesName !== "Any Series") {
                const option = document.createElement('option');
                option.value = seriesName;
                option.textContent = seriesName;
                seriesSelect.appendChild(option);
            }
        });

        // Restore saved selection
        const savedSeries = localStorage.getItem('selectedSeries');
        if (savedSeries && openingBook.series[savedSeries]) {
            seriesSelect.value = savedSeries;
        }
    }
}

// Initialize board
const board = Chessboard('board', {
    position: 'start',
    draggable: true,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
});

// Set up the arrow layer
const arrowLayer = document.getElementById('arrow-layer');

// Add event listener for series selection changes
document.getElementById('series-select').addEventListener('change', (e) => {
    localStorage.setItem('selectedSeries', e.target.value);
    onPositionChange(); // Trigger position change when series changes
});

// Add event listener for sort selection changes
document.getElementById('sort-select').addEventListener('change', () => {
    onPositionChange(); // Trigger position change when sort option changes
});

// Add event listener for player color changes
document.getElementById('player-color').addEventListener('click', (e) => {
    const button = e.target;
    const currentColor = button.textContent.includes('White') ? 'w' : 'b';
    const newColor = currentColor === 'w' ? 'b' : 'w';
    
    // Update button text
    button.textContent = `Playing as ${newColor === 'w' ? 'White' : 'Black'}`;
    
    // Update board orientation
    updateBoardOrientation();
    
    // Trigger position change
    onPositionChange();
});

// Trigger initial position change
onPositionChange();

// Handle key events for navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        goToPreviousMove();
    } else if (e.key === 'ArrowRight') {
        goToNextMove();
    }
});

// Set up button click handlers
document.getElementById('start-btn').addEventListener('click', goToStart);
document.getElementById('prev-btn').addEventListener('click', goToPreviousMove);
document.getElementById('next-btn').addEventListener('click', goToNextMove);
document.getElementById('end-btn').addEventListener('click', goToEnd);
document.getElementById('new-game-btn').addEventListener('click', startNewGame);
document.getElementById('load-pgn-btn').addEventListener('click', loadPGN);
document.getElementById('lichess-analysis-btn').addEventListener('click', openInLichess);

// Check if a move is legal
function onDragStart(source, piece, position, orientation) {
    // Only allow the current player to move their pieces
    if ((chess.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (chess.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }

    // Don't allow moves if the game is over
    if (chess.game_over()) {
        return false;
    }

    return true;
}

// Handle piece movement
function onDrop(source, target) {
    // Check if this move would result in a pawn promotion
    const moveObj = {
        from: source,
        to: target,
        promotion: 'q' // default to queen
    };

    // Get the moving piece
    const piece = chess.get(source);

    // Check if it's a pawn moving to the last rank
    if (piece && piece.type === 'p' && (target.charAt(1) === '8' || target.charAt(1) === '1')) {
        // Store the pending promotion move
        pendingPromotion = { source, target };

        // Show promotion dialog
        showPromotionDialog(chess.turn());

        return 'snapback'; // Don't complete the move yet
    }

    // Try to make the move
    const move = chess.move(moveObj);

    // If illegal move, snap back
    if (move === null) return 'snapback';

    // Save the last move
    lastMove = { from: source, to: target };

    // If we're in the middle of history, truncate and start a new branch
    if (currentPosition < moveHistory.length - 1) {
        // Remove future moves
        moveHistory = moveHistory.slice(0, currentPosition + 1);
    }

    // Valid move - add to history
    addMoveToHistory(move);
    updateStatus();

    return true;
}

// Update the board position after the piece snap
function onSnapEnd() {
    board.position(chess.fen());
    onPositionChange();
}

function getNodeAtCurrentPosition() {
    let uci_Moves = getUciMoves();
    let node = openingBook[document.getElementById('player-color').textContent.includes('White') ? "White" : "Black"];
    for (let i = 0; i < uci_Moves.length; i++) {
        let uci_move = uci_Moves[i];
        if (!(uci_move in node)) {
            return null;
        }
        node = node[uci_move];
    }
    return node;
}

function getCurrentSeriesGameIds(){
    let seriesName = document.getElementById("series-select").value;
    console.log(seriesName);
    return openingBook.series[seriesName];
}

// Function called whenever the board position changes
function onPositionChange() {
    // Queue the position change to run after book loads
    bookLoadedPromise.then(() => {
        let node = getNodeAtCurrentPosition();
        series_game_ids = getCurrentSeriesGameIds();
        arrows = [];
        if (node) {
            // Part 1: draw the arrows
            console.log(node);
            // Find the maximum number of games for any move to calculate alpha values
            let maxGames = 0;
            for (move in node) {
                if (move === "game_ids") {
                    continue;
                }
                let game_ids_at_move = node[move]["game_ids"];
                game_ids_at_move = game_ids_at_move.intersection(series_game_ids);
                maxGames = Math.max(maxGames, game_ids_at_move.size);
            }

            // Now add arrows with alpha values
            for (move in node) {
                if (move === "game_ids") {
                    continue;
                }
                let game_ids_at_move = node[move]["game_ids"];
                game_ids_at_move = game_ids_at_move.intersection(series_game_ids);
                if (game_ids_at_move.size > 0) {
                    // Calculate alpha value based on number of games (0.3 to 1.0)
                    const alpha = 0.3 + (0.7 * (game_ids_at_move.size / maxGames));
                    arrows.push({
                        move: move,
                        alpha: alpha
                    });
                }
            }
            // Part 2: insert the youtube links
            console.log("Starting part 2");
            const videoListContainer = document.getElementById('video-list-container');
            videoListContainer.innerHTML = ''; // Clear existing videos
            
            // Create array of video data for sorting
            const videoData = [];
            for (game_id of node["game_ids"]) {
                if (!(series_game_ids.has(game_id))) {
                    continue;
                }
                let game_data = openingBook.games[game_id];
                let vs_str = game_data[0];
                let yt_link = game_data[1];
                let elo = game_data[2];
                console.log(elo);
                videoData.push({ game_id, vs_str, yt_link, elo });
            }

            // Sort videos based on selected option
            const sortSelect = document.getElementById('sort-select');
            videoData.sort((a, b) => {
                switch (sortSelect.value) {
                    case 'elo-high-low':
                        return b.elo - a.elo;
                    case 'elo-low-high':
                        return a.elo - b.elo;
                    case 'elo-closest':
                        // Assuming we want to sort by closest to 1500 Elo
                        const targetElo = 1500;
                        return Math.abs(a.elo - targetElo) - Math.abs(b.elo - targetElo);
                    default:
                        alert("Invalid sort option");
                        return 0;
                }
            });
            
            // Create video items from sorted data
            for (const video of videoData) {
                // Create video item element
                const videoItem = document.createElement('a');
                videoItem.href = video.yt_link;
                videoItem.className = 'video-item';
                videoItem.target = '_blank';
                
                // Extract video ID from YouTube link for thumbnail
                let videoId;
                if (video.yt_link.includes('youtu.be/')) {
                    videoId = video.yt_link.split('youtu.be/')[1]?.split('?')[0];
                } else {
                    videoId = video.yt_link.split('v=')[1]?.split('&')[0];
                }
                
                // console.log("YouTube link:", video.yt_link); // Debug the full link
                // console.log("Extracted video ID:", videoId);
                const thumbnailUrl = `https://img.youtube.com/vi/${videoId || ''}/mqdefault.jpg`;
                
                // Create thumbnail image
                const thumbnail = document.createElement('img');
                thumbnail.src = thumbnailUrl;
                thumbnail.alt = 'Video thumbnail';
                
                // Create text container
                const videoText = document.createElement('div');
                videoText.className = 'video-text';
                
                // Create title with Elo rating
                const title = document.createElement('div');
                title.className = 'video-title';
                title.textContent = `${video.vs_str} (${video.elo})`;
                
                // Assemble the video item
                videoText.appendChild(title);
                videoItem.appendChild(thumbnail);
                videoItem.appendChild(videoText);
                
                // Add to container
                videoListContainer.appendChild(videoItem);
                
                console.log(video.vs_str, video.yt_link);
            }
        }
        redrawArrows();
    });
}

// Add move to history and update UI
function addMoveToHistory(move) {
    moveHistory.push(move);
    currentPosition = moveHistory.length - 1;
    updateMoveList();
}

// Show pawn promotion dialog
function showPromotionDialog(color) {
    const modal = document.getElementById('promotion-modal');
    const options = document.getElementById('promotion-options');

    // Clear previous options
    options.innerHTML = '';

    // Create options for queen, rook, bishop, knight
    const pieces = ['q', 'r', 'b', 'n'];
    pieces.forEach(piece => {
        const img = document.createElement('img');
        img.src = `img/chesspieces/wikipedia/${color}${piece.toUpperCase()}.png`;
        img.classList.add('promotion-piece');
        img.addEventListener('click', () => handlePromotion(piece));
        options.appendChild(img);
    });

    modal.style.display = 'flex';
}

// Handle promotion piece selection
function handlePromotion(piece) {
    const modal = document.getElementById('promotion-modal');

    if (pendingPromotion) {
        // If we're in the middle of history, truncate and start a new branch
        if (currentPosition < moveHistory.length - 1) {
            // Remove future moves
            moveHistory = moveHistory.slice(0, currentPosition + 1);
        }

        const move = chess.move({
            from: pendingPromotion.source,
            to: pendingPromotion.target,
            promotion: piece
        });

        // Save the last move
        lastMove = { from: pendingPromotion.source, to: pendingPromotion.target };

        // Add the move to history
        addMoveToHistory(move);

        // Update the board
        board.position(chess.fen());
        updateStatus();

        // Reset pending promotion
        pendingPromotion = null;
    }

    // Hide the modal
    modal.style.display = 'none';
}

// Draw arrows to show moves
function redrawArrows() {
    // Clear existing arrows
    arrowLayer.innerHTML = '';

    // Get board size
    const boardEl = document.getElementById('board');
    const boardRect = boardEl.getBoundingClientRect();
    const squareSize = boardRect.width / 8;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    // Create defs for arrowhead marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerWidth', '4');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('refX', '2.05');
    marker.setAttribute('refY', '2.01');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,0 V4 L3,2 Z');
    path.setAttribute('fill', '#15781B');
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Check if playing as Black
    const isBlack = document.getElementById('player-color').textContent.includes('Black');

    // Draw all arrows
    arrows.forEach((arrow, index) => {
        const from = arrow.move.substring(0, 2);
        const to = arrow.move.substring(2, 4);

        // Calculate the center coordinates of the squares
        const fromFile = from.charCodeAt(0) - 'a'.charCodeAt(0);
        const fromRank = 8 - parseInt(from.charAt(1));
        const toFile = to.charCodeAt(0) - 'a'.charCodeAt(0);
        const toRank = 8 - parseInt(to.charAt(1));

        // Mirror coordinates if playing as Black
        const fromX = isBlack ? 
            (7 - fromFile) * squareSize + squareSize / 2 :
            fromFile * squareSize + squareSize / 2;
        const fromY = isBlack ?
            (7 - fromRank) * squareSize + squareSize / 2 :
            fromRank * squareSize + squareSize / 2;
        const toX = isBlack ?
            (7 - toFile) * squareSize + squareSize / 2 :
            toFile * squareSize + squareSize / 2;
        const toY = isBlack ?
            (7 - toRank) * squareSize + squareSize / 2 :
            toRank * squareSize + squareSize / 2;

        // Calculate the length and angle of the line
        const dx = toX - fromX;
        const dy = toY - fromY;
        const length = Math.sqrt(dx * dx + dy * dy);

        // Adjust the line to not cover the entire square
        const scale = (length - squareSize * 0.3) / length;
        const adjustedToX = fromX + dx * scale;
        const adjustedToY = fromY + dy * scale;

        // Create line element
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', fromX);
        line.setAttribute('y1', fromY);
        line.setAttribute('x2', adjustedToX);
        line.setAttribute('y2', adjustedToY);
        line.setAttribute('stroke', '#15781B');
        line.setAttribute('stroke-width', squareSize * 0.14);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        line.setAttribute('opacity', arrow.alpha);

        svg.appendChild(line);
    });

    arrowLayer.appendChild(svg);
}

// Update the move list display
function updateMoveList() {
    const movesDiv = document.getElementById('moves');
    movesDiv.innerHTML = '';

    let moveRow = null;
    let moveNumber = null;

    moveHistory.forEach((move, index) => {
        // Start a new row for every white move
        if (index % 2 === 0) {
            moveRow = document.createElement('div');
            moveRow.className = 'move-row';

            moveNumber = document.createElement('div');
            moveNumber.className = 'move-number';
            moveNumber.textContent = Math.floor(index / 2) + 1 + '.';
            moveRow.appendChild(moveNumber);

            movesDiv.appendChild(moveRow);
        }

        const moveElem = document.createElement('div');
        moveElem.className = 'move';
        if (index === currentPosition) {
            moveElem.classList.add('active');
        }

        // Format move text
        let moveText = '';

        // Add piece symbol
        if (move.piece !== 'p') {
            moveText += move.piece.toUpperCase();
        }

        // Add capture indicator
        if (move.captured) {
            if (move.piece === 'p') {
                moveText += move.from.charAt(0);
            }
            moveText += 'x';
        }

        // Add target square
        moveText += move.to;

        // Add promotion piece
        if (move.promotion) {
            moveText += '=' + move.promotion.toUpperCase();
        }

        // Add check/checkmate
        if (move.san.includes('+')) {
            moveText += '+';
        } else if (move.san.includes('#')) {
            moveText += '#';
        }

        moveElem.textContent = moveText;
        moveElem.dataset.index = index;

        moveElem.addEventListener('click', () => {
            goToMove(index);
        });

        moveRow.appendChild(moveElem);
    });

    // Scroll to the current move
    if (currentPosition >= 0) {
        const activeMove = movesDiv.querySelector('.move.active');
        if (activeMove) {
            activeMove.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    updateNavigationButtons();
}

// Update status message
function updateStatus() {
    const statusElement = document.getElementById('status');
    let status = '';

    if (chess.in_checkmate()) {
        status = (chess.turn() === 'w' ? 'Black' : 'White') + ' wins - Checkmate';
    } else if (chess.in_draw()) {
        status = 'Game Over - Draw';
        if (chess.in_stalemate()) {
            status += ' (Stalemate)';
        } else if (chess.in_threefold_repetition()) {
            status += ' (Threefold Repetition)';
        } else if (chess.insufficient_material()) {
            status += ' (Insufficient Material)';
        } else if (chess.in_fifty_move_rule()) {
            status += ' (Fifty Move Rule)';
        }
    } else {
        status = (chess.turn() === 'w' ? 'White' : 'Black') + ' to move';
        if (chess.in_check()) {
            status += ' (In Check)';
        }
    }

    statusElement.textContent = status;
}

// Navigate to a specific move in history
function goToMove(index) {
    if (index < 0 || index >= moveHistory.length) return;

    // Reset the chess position
    chess.reset();

    // Replay moves up to the selected index
    for (let i = 0; i <= index; i++) {
        chess.move(moveHistory[i]);
    }

    // Update the board position
    board.position(chess.fen());
    onPositionChange();

    // Update current position
    currentPosition = index;

    // Draw arrow for last move if not at start position
    if (index >= 0) {
        const move = moveHistory[index];
    } else {
        // Clear arrows if at start
        arrowLayer.innerHTML = '';
    }

    // Update UI
    updateMoveList();
    updateStatus();
}

// Go to the start position
function goToStart() {
    chess.reset();
    board.position('start');
    onPositionChange();
    currentPosition = -1;
    // Clear arrows
    arrowLayer.innerHTML = '';
    updateMoveList();
    updateStatus();
}

// Go to the previous move
function goToPreviousMove() {
    if (currentPosition > -1) {
        goToMove(currentPosition - 1);
    }
}

// Go to the next move
function goToNextMove() {
    if (currentPosition < moveHistory.length - 1) {
        goToMove(currentPosition + 1);
    }
}

// Go to the final position
function goToEnd() {
    if (moveHistory.length > 0) {
        goToMove(moveHistory.length - 1);
    }
}

// Start a new game
function startNewGame() {
    chess.reset();
    board.position('start');
    onPositionChange();
    moveHistory = [];
    currentPosition = -1;
    lastMove = null;
    // Clear arrows
    arrowLayer.innerHTML = '';
    updateMoveList();
    updateStatus();
}

// Update navigation buttons
function updateNavigationButtons() {
    document.getElementById('start-btn').disabled = moveHistory.length === 0 || currentPosition === -1;
    document.getElementById('prev-btn').disabled = moveHistory.length === 0 || currentPosition === -1;
    document.getElementById('next-btn').disabled = moveHistory.length === 0 || currentPosition === moveHistory.length - 1;
    document.getElementById('end-btn').disabled = moveHistory.length === 0 || currentPosition === moveHistory.length - 1;
}

// Get UCI moves for current position
function getUciMoves() {
    return moveHistory.slice(0, currentPosition + 1).map(move => {
        // Handle promotions
        if (move.promotion) {
            return move.from + move.to + move.promotion.toLowerCase();
        }
        return move.from + move.to;
    });
}

// Handle window resize to redraw arrows properly
window.addEventListener('resize', () => {
    board.resize();
    redrawArrows();
});

// Initial status update
updateStatus();

// Function to update board orientation based on player color
function updateBoardOrientation() {
    const button = document.getElementById('player-color');
    const color = button.textContent.includes('White') ? 'w' : 'b';
    board.orientation(color === 'w' ? 'white' : 'black');
}

// Function to load and play through PGN
function loadPGN() {
    const pgnText = document.getElementById('pgn-input').value.trim();
    if (!pgnText) return;

    // Reset the game
    chess.reset();
    moveHistory = [];
    currentPosition = -1;
    board.position('start');

    // Load the PGN
    chess.load_pgn(pgnText);

    // Get the main line moves
    const moves = chess.history({ verbose: true });

    // Play through all moves
    moves.forEach(move => {
        chess.move(move);
        moveHistory.push(move);
        currentPosition = moveHistory.length - 1;
    });

    // Update the board and UI
    board.position(chess.fen());
    updateMoveList();
    updateStatus();
    onPositionChange();

    // Find the divergence point and navigate to it
    const divergencePoint = findDivergencePoint();
    if (divergencePoint !== -1) {
        goToMove(divergencePoint);
    } else {
        // If no divergence point found, go to the end
        goToEnd();
    }
}

// Function to find the point of divergence from the opening book
function findDivergencePoint() {
    let uciMoves = getUciMoves();
    let node = openingBook[document.getElementById('player-color').textContent.includes('White') ? "White" : "Black"];
    let divergencePoint = -1;
    let series_game_ids = getCurrentSeriesGameIds();

    // If we're at the start position, no divergence
    if (uciMoves.length === 0) {
        return -1;
    }

    // Check each move in the current game
    for (let i = 0; i < uciMoves.length; i++) {
        let uciMove = uciMoves[i];
        
        // If this move exists in the current node
        if (uciMove in node) {
            // Check if this move has any games in the current series
            let game_ids_at_move = node[uciMove]["game_ids"];
            game_ids_at_move = game_ids_at_move.intersection(series_game_ids);
            
            if (game_ids_at_move.size > 0) {
                node = node[uciMove];
            } else {
                // Move exists but not in current series
                divergencePoint = i;
                break;
            }
        } else {
            // Move doesn't exist at all
            divergencePoint = i;
            break;
        }
    }

    // If we got through all moves and still have a valid node, no divergence
    if (divergencePoint === -1) {
        return -1;
    }

    return divergencePoint - 1; 
}

// Function to open current position in Lichess analysis
function openInLichess() {
    const fen = chess.fen();
    const url = `https://lichess.org/analysis/${fen}`;
    window.open(url, '_blank');
} 