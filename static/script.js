function showImageDetails(image) {
    const modal = document.getElementById('image-modal');
    const modalContent = document.getElementById('modal-content');
    
    if (!modal || !modalContent) {
        console.error('Modal elements not found');
        return;
    }

    modalContent.innerHTML = `
        <span class="close">&times;</span>
        <img src="${image.url}" alt="${image.prompt}" class="full-size-image">
        <div class="image-details">
            <h3>Prompt:</h3>
            <p>${image.prompt}</p>
        </div>
    `;
    modal.style.display = 'block';

    const closeBtn = modalContent.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = 'none';
        }
    }

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
}

// Attach click listener to the generated image
document.getElementById('image-result').addEventListener('click', function(e) {
    if (e.target.tagName === 'IMG') {
        const imageDetails = {
            url: e.target.src,
            prompt: e.target.alt,
            aspectRatio: e.target.dataset.aspectRatio,
            format: e.target.dataset.format
        };
        showImageDetails(imageDetails);
    }
});

// Global functions

function updateFavoritesList() {
    fetch('/favorites')
        .then(response => response.json())
        .then(favorites => {
            const favoritesList = document.getElementById('favorites-list');
            favoritesList.innerHTML = '';
            favorites.forEach(fav => {
                const li = document.createElement('li');
                li.className = 'favorite-item';
                li.innerHTML = `
                    <div class="favorite-image-container">
                        <img src="${fav.url}" alt="${fav.prompt}" data-id="${fav.image_id}">
                    </div>
                    <div class="favorite-content">
                        <span class="favorite-prompt">${fav.prompt}</span>
                        <button class="delete-favorite" data-id="${fav.image_id}">
                            <i class="far fa-trash-alt"></i>
                        </button>
                    </div>
                `;
                favoritesList.appendChild(li);
            });
            attachDeleteFavoriteListeners();
            attachFavoritesImageClickListeners();
        })
        .catch(error => {
            console.error('Error updating favorites:', error);
        });
}

function toggleFavorite(imageId) {
    fetch(`/favorite/${imageId}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'favorited' || data.status === 'unfavorited') {
                updateFavoritesList();
                updateFavoriteButtons(imageId, data.status === 'favorited');
            }
        })
        .catch(error => {
            console.error('Error toggling favorite:', error);
        });
}

function updateFavoriteButtons(imageId, isFavorite) {
    const buttons = document.querySelectorAll(`.favorite-button[data-id="${imageId}"]`);
    buttons.forEach(button => {
        button.classList.toggle('active', isFavorite);
        button.innerHTML = isFavorite ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
    });
}

function attachFavoriteListeners() {
    const favoriteButtons = document.querySelectorAll('.favorite-button');
    favoriteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const imageId = this.dataset.id;
            toggleFavorite(imageId);
        });
    });
}

function attachDeleteFavoriteListeners() {
    const deleteButtons = document.querySelectorAll('.delete-favorite');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const imageId = this.dataset.id;
            toggleFavorite(imageId);
        });
    });
}

function attachFavoritesImageClickListeners() {
    const favoriteItems = document.querySelectorAll('.favorite-item');
    favoriteItems.forEach(item => {
        item.addEventListener('click', function(e) {
            if (!e.target.closest('.delete-favorite')) {
                const img = this.querySelector('img');
                const imageDetails = {
                    url: img.src,
                    prompt: img.alt,
                    id: img.dataset.id
                };
                showImageDetails(imageDetails);
            }
        });
    });
}

function attachFavoriteListener() {
    const favoriteButton = document.querySelector('.favorite-button');
    if (favoriteButton) {
        favoriteButton.addEventListener('click', function() {
            const imageId = this.dataset.id;
            toggleFavorite(imageId);
        });
    }
}

// DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    const imageForm = document.getElementById('image-form');
    const qualityInput = document.getElementById('quality');
    const qualityValue = document.getElementById('quality-value');
    const promptStrengthInput = document.getElementById('prompt-strength');
    const promptStrengthValue = document.getElementById('prompt-strength-value');
    const favoritesList = document.getElementById('favorites-list');
    const generateButton = document.getElementById('generate-button');
    const historyButton = document.getElementById('history-button');
    const trashBinButton = document.getElementById('trash-bin-button');
    const imageGenerator = document.getElementById('image-generator');
    const imageHistory = document.getElementById('image-history');
    const trashBin = document.getElementById('trash-bin');

    // Image generation
    imageForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(this);
        const resultDiv = document.getElementById('image-result');
        resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Generating image...</p></div>';

        fetch('/generate', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.image_url) {
                resultDiv.innerHTML = `
                    <div class="image-container">
                        <img src="${data.image_url}" alt="Generated Image">
                        <button class="favorite-button" data-id="${data.generation_id}">
                            <i class="far fa-heart"></i>
                        </button>
                    </div>
                `;
                attachFavoriteListener();
            } else {
                resultDiv.innerHTML = `<p class="error">Error generating image: ${data.error}</p>`;
            }
        })
        .catch(error => {
            resultDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            console.error('Error:', error);
        });
    });

    // Favorite functionality
    function updateFavoritesList() {
        fetch('/favorites')
            .then(response => response.json())
            .then(favorites => {
                favoritesList.innerHTML = '';
                favorites.forEach(fav => {
                    const li = document.createElement('li');
                    li.className = 'favorite-item';
                    li.innerHTML = `
                        <div class="favorite-image-container">
                            <img src="${fav.url}" alt="${fav.prompt}" data-id="${fav.image_id}">
                        </div>
                        <div class="favorite-content">
                            <span class="favorite-prompt">${fav.prompt}</span>
                            <button class="delete-favorite" data-id="${fav.image_id}">
                                <i class="far fa-trash-alt"></i>
                            </button>
                        </div>
                    `;
                    favoritesList.appendChild(li);
                });
                attachDeleteFavoriteListeners();
                attachFavoritesImageClickListeners();
            })
            .catch(error => {
                console.error('Error updating favorites:', error);
            });
    }

    function updateFavoriteButtons(imageId, isFavorite) {
        const buttons = document.querySelectorAll(`.favorite-button[data-id="${imageId}"]`);
        buttons.forEach(button => {
            button.classList.toggle('active', isFavorite);
            button.innerHTML = isFavorite ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
        });
    }

    function attachFavoriteListeners() {
        const favoriteButtons = document.querySelectorAll('.favorite-button');
        favoriteButtons.forEach(button => {
            button.addEventListener('click', function() {
                const imageId = this.dataset.id;
                toggleFavorite(imageId);
            });
        });
    }

    function attachDeleteFavoriteListeners() {
        const deleteButtons = document.querySelectorAll('.delete-favorite');
        deleteButtons.forEach(button => {
            button.addEventListener('click', function() {
                const imageId = this.dataset.id;
                toggleFavorite(imageId);
            });
        });
    }

    // Image history functionality
    let isLoadingHistory = false;
    let lastLoadedHistory = null;

    function loadImageHistory() {
        if (isLoadingHistory) {
            console.log('Already loading image history, please wait...');
            return;
        }

        if (lastLoadedHistory) {
            console.log('Using cached image history');
            updateHistoryGallery(lastLoadedHistory);
            return;
        }

        isLoadingHistory = true;
        console.log('Fetching image history...');
        fetch('/image_history')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(images => {
                console.log('Received image history:', images);
                lastLoadedHistory = images;
                updateHistoryGallery(images);
            })
            .catch(error => {
                console.error('Error loading image history:', error);
                const historyGallery = document.getElementById('history-gallery');
                historyGallery.innerHTML = `<p>Error loading history: ${error.message}</p>`;
            })
            .finally(() => {
                isLoadingHistory = false;
            });
    }

    function updateHistoryGallery(images) {
        const historyGallery = document.getElementById('history-gallery');
        historyGallery.innerHTML = '';
        if (images.length === 0) {
            console.log('No images in history');
            historyGallery.innerHTML = '<p>No images in history.</p>';
        } else {
            images.forEach(image => {
                if (image.url) {
                    const imageElement = createImageElement(image);
                    historyGallery.appendChild(imageElement);
                } else {
                    console.warn(`Skipping image with id ${image.id} due to missing URL`);
                }
            });
        }
        attachFavoriteListeners();
        attachImageClickListeners();
    }

    function createImageElement(image) {
        const div = document.createElement('div');
        div.className = 'image-item';
        div.innerHTML = `
            <img src="${image.url}" alt="${image.prompt}" data-id="${image.id}" onerror="handleImageError(this, '${image.url}')">
            <div class="image-info">
                <p>${image.prompt}</p>
                <p>Generated: ${new Date(image.created_at).toLocaleString()}</p>
            </div>
            <button class="favorite-button ${image.is_favorite ? 'active' : ''}" data-id="${image.id}">
                <i class="${image.is_favorite ? 'fas' : 'far'} fa-heart"></i>
            </button>
            <button class="delete-image" data-id="${image.id}">
                <i class="far fa-trash-alt"></i>
            </button>
        `;
        return div;
    }

    function handleImageError(img, originalSrc) {
        console.warn('Image failed to load:', originalSrc);
        img.onerror = null; // Prevent infinite loop
        img.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20200%20200%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%23holder_1687474b5b4%20text%20%7B%20fill%3A%23AAAAAA%3Bfont-weight%3Abold%3Bfont-family%3AArial%2C%20Helvetica%2C%20Open%20Sans%2C%20sans-serif%2C%20monospace%3Bfont-size%3A10pt%20%7D%20%3C%2Fstyle%3E%3C%2Fdefs%3E%3Cg%20id%3D%22holder_1687474b5b4%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23EEEEEE%22%3E%3C%2Frect%3E%3Cg%3E%3Ctext%20x%3D%2274.4296875%22%20y%3D%22104.5%22%3EImage%20Not%20Found%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E';
        img.alt = 'Image Not Found';
    }

    // Modify the history button click event listener
    historyButton.addEventListener('click', function(e) {
        e.preventDefault();
        generateButton.classList.remove('active');
        historyButton.classList.add('active');
        trashBinButton.classList.remove('active');
        imageGenerator.classList.remove('active');
        imageHistory.classList.add('active');
        trashBin.classList.remove('active');
        loadImageHistory();
    });

    // Add a function to clear the history cache
    function clearHistoryCache() {
        lastLoadedHistory = null;
    }

    // Call this function when you know the history has changed (e.g., after deleting or restoring an image)
    function refreshImageHistory() {
        clearHistoryCache();
        loadImageHistory();
    }

    // Trash bin functionality
    function loadTrashBin() {
        fetch('/recycle_bin')
            .then(response => response.json())
            .then(items => {
                const trashBinGallery = document.getElementById('trash-bin-gallery');
                trashBinGallery.innerHTML = '';
                items.forEach(item => {
                    const itemElement = createTrashItemElement(item);
                    trashBinGallery.appendChild(itemElement);
                });
                attachTrashItemListeners();
            })
            .catch(error => {
                console.error('Error loading trash bin:', error);
            });
    }

    function restoreImage(imageId) {
        fetch('/restore_image/' + imageId, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'restored') {
                    loadTrashBin();
                    refreshImageHistory();
                }
            })
            .catch(error => {
                console.error('Error restoring image:', error);
            });
    }

    // Navigation
    generateButton.addEventListener('click', () => {
        generateButton.classList.add('active');
        historyButton.classList.remove('active');
        trashBinButton.classList.remove('active');
        imageGenerator.classList.add('active');
        imageHistory.classList.remove('active');
        trashBin.classList.remove('active');
    });

    historyButton.addEventListener('click', function(e) {
        e.preventDefault(); // Prevent the default link behavior
        generateButton.classList.remove('active');
        historyButton.classList.add('active');
        trashBinButton.classList.remove('active');
        imageGenerator.classList.remove('active');
        imageHistory.classList.add('active');
        trashBin.classList.remove('active');
        loadImageHistory();
    });

    trashBinButton.addEventListener('click', () => {
        generateButton.classList.remove('active');
        historyButton.classList.remove('active');
        trashBinButton.classList.add('active');
        imageGenerator.classList.remove('active');
        imageHistory.classList.remove('active');
        trashBin.classList.add('active');
        loadTrashBin();
    });

    // Slider inputs
    qualityInput.addEventListener('input', function() {
        qualityValue.textContent = this.value;
    });

    promptStrengthInput.addEventListener('input', function() {
        promptStrengthValue.textContent = this.value;
    });

    // Initialize
    updateFavoritesList();
    loadImageHistory();

    const burgerMenu = document.getElementById('burger-menu');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebar = document.querySelector('.sidebar');

    burgerMenu.addEventListener('click', function() {
        sidebar.classList.add('active');
    });

    closeSidebar.addEventListener('click', function() {
        sidebar.classList.remove('active');
    });

    // Close sidebar when clicking outside of it
    document.addEventListener('click', function(event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnBurgerMenu = burgerMenu.contains(event.target);
        
        if (!isClickInsideSidebar && !isClickOnBurgerMenu && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
    });
});

function attachImageClickListeners() {
    const historyGallery = document.getElementById('history-gallery');
    historyGallery.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-image') || e.target.closest('.delete-image')) {
            const imageId = e.target.closest('.delete-image').dataset.id;
            deleteImage(imageId);
        } else if (e.target.tagName === 'IMG') {
            const imageDetails = {
                url: e.target.src,
                prompt: e.target.alt,
                id: e.target.dataset.id
            };
            showImageDetails(imageDetails);
        }
    });
}

function deleteImage(imageId) {
    fetch(`/delete_image/${imageId}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'deleted') {
                refreshImageHistory();
                updateFavoritesList();
            }
        })
        .catch(error => {
            console.error('Error deleting image:', error);
        });
}

function restoreImage(imageId) {
    fetch(`/restore_image/${imageId}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'restored') {
                loadTrashBin();
                refreshImageHistory();
            }
        })
        .catch(error => {
            console.error('Error restoring image:', error);
        });
}

function createTrashItemElement(item) {
    const div = document.createElement('div');
    div.className = 'image-item';
    div.innerHTML = `
        <img src="${item.url}" alt="Deleted Image">
        <div class="image-info">
            <p>Deleted: ${new Date(item.deleted_at).toLocaleString()}</p>
        </div>
        <button class="restore-image" data-id="${item.image_id}">
            <i class="fas fa-undo"></i> Restore
        </button>
    `;
    return div;
}

function attachTrashItemListeners() {
    const trashBinGallery = document.getElementById('trash-bin-gallery');
    trashBinGallery.addEventListener('click', function(e) {
        if (e.target.classList.contains('restore-image') || e.target.closest('.restore-image')) {
            const imageId = e.target.closest('.restore-image').dataset.id;
            restoreImage(imageId);
        }
    });
}
