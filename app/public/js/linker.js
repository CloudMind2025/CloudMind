document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('button[data-link]').forEach(button => {
    button.addEventListener('click', () => {
      const link = button.getAttribute('data-link');
      if (link) {
        window.location.href = link;
      } else {
        console.warn('Nenhum link definido para este botão:', button);
      }
    });
  });
});
