// Function to open a modal
const openModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      const card = modal.querySelector('.glass-card');
      if (card) {
        card.classList.remove('scale-95');
      }
    }, 10);
  }
};

// Function to close a modal
const closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) {
    const card = modal.querySelector('.glass-card');
    if (card) {
      card.classList.add('scale-95');
    }
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }
};

// Function to show a specific page and hide others
const showPage = (pageId) => {
  document.querySelectorAll('.page-content').forEach((page) => {
    page.classList.add('hidden');
  });
  const activePage = document.getElementById(`page-${pageId}`);
  if (activePage) {
    activePage.classList.remove('hidden');
  }
};

export { openModal, closeModal, showPage };
