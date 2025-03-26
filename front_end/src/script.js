
// Initialize chess game
const chess = new Chess();
let moveHistory = [];
let currentPosition = -1;
let boardPosition = 'start';
let pendingPromotion = null;
let lastMove = null;

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

    // Draw the move arrow
    drawMoveArrow(source, target);

    return true;
}

// Update the board position after the piece snap
function onSnapEnd() {
    board.position(chess.fen());
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
        img.src = `https://cdnjs.cloudflare.com/ajax/libs/chessboard-js/1.0.0/img/chesspieces/wikipedia/${color}${piece.toUpperCase()}.png`;
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

        // Draw the move arrow
        drawMoveArrow(pendingPromotion.source, pendingPromotion.target);

        // Reset pending promotion
        pendingPromotion = null;
    }

    // Hide the modal
    modal.style.display = 'none';
}

// Draw an arrow to show the last move
function drawMoveArrow(from, to) {
    // Clear existing arrows
    arrowLayer.innerHTML = '';

    // Get board size
    const boardEl = document.getElementById('board');
    const boardRect = boardEl.getBoundingClientRect();
    const squareSize = boardRect.width / 8;

    // Calculate the center coordinates of the squares
    const fromFile = from.charCodeAt(0) - 'a'.charCodeAt(0);
    const fromRank = 8 - parseInt(from.charAt(1));
    const toFile = to.charCodeAt(0) - 'a'.charCodeAt(0);
    const toRank = 8 - parseInt(to.charAt(1));

    const fromX = fromFile * squareSize + squareSize / 2;
    const fromY = fromRank * squareSize + squareSize / 2;
    const toX = toFile * squareSize + squareSize / 2;
    const toY = toRank * squareSize + squareSize / 2;

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
    line.setAttribute('opacity', '1');

    svg.appendChild(line);
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

    // Update current position
    currentPosition = index;

    // Draw arrow for last move if not at start position
    if (index >= 0) {
        const move = moveHistory[index];
        drawMoveArrow(move.from, move.to);
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

// Handle window resize to redraw arrows properly
window.addEventListener('resize', () => {
    board.resize();

    // Redraw the arrow if there's a last move
    if (currentPosition >= 0) {
        const move = moveHistory[currentPosition];
        drawMoveArrow(move.from, move.to);
    }
});

// Initial status update
updateStatus();