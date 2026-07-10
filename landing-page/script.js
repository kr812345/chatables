// Chatables Landing Page Interactions

document.addEventListener('DOMContentLoaded', () => {
  setupHeaderScroll();
  setupScrollAnimations();
});

// 1. Dynamic Header Scroll States
function setupHeaderScroll() {
  const header = document.getElementById('site-header');
  
  if (!header) return;

  const toggleHeaderState = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
      header.style.backgroundColor = 'rgba(255, 249, 246, 0.95)';
      header.style.boxShadow = '0 10px 30px -10px rgba(28, 25, 23, 0.08)';
    } else {
      header.classList.remove('scrolled');
      header.style.backgroundColor = 'rgba(255, 249, 246, 0.8)';
      header.style.boxShadow = 'none';
    }
  };

  // Run on load and add listener
  toggleHeaderState();
  window.addEventListener('scroll', toggleHeaderState);
}

// 2. Scroll Animation Trigger using IntersectionObserver
function setupScrollAnimations() {
  const animateOnScrollElements = [
    ...document.querySelectorAll('.feature-card'),
    document.querySelector('.hero-content'),
    document.querySelector('.hero-mockup-wrapper'),
    document.querySelector('.section-header')
  ].filter(Boolean);

  // Set initial hidden states in JS so non-JS users still see content
  animateOnScrollElements.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
  });

  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const target = entry.target;
        target.style.opacity = '1';
        target.style.transform = 'translateY(0)';
        observer.unobserve(target); // Only animate once
      }
    });
  }, observerOptions);

  animateOnScrollElements.forEach((el) => {
    observer.observe(el);
  });
}
