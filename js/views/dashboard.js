// Dashboard view — placeholder stub. Real content ships in v0.13 (Deploy 2).

const TEMPLATE = `
  <section id="dashboard-section">
    <div class="coming-soon">
      <h2>Dashboard</h2>
      <p>Budget overview lands in the next update.</p>
    </div>
  </section>
`;

export default {
  mount(root) {
    root.innerHTML = TEMPLATE;
  },

  unmount() {},
};
