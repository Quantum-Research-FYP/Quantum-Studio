import { Link } from 'react-router-dom';
import Seo from '../components/Seo';

export default function ResearchPage() {
  return (
    <article className="research-page">
      <Seo
        title="Quantum Computing Research Tools — Quantum Experiment Studio"
        description="Explore the simulation, circuit analysis, visualization, and reproducible experiment capabilities of Quantum Experiment Studio."
        path="/research"
        type="article"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: 'Quantum computing research tools in Quantum Experiment Studio',
          description: 'An overview of the platform’s circuit simulation, analysis, visualization, and reproducible experiment capabilities.',
          url: 'https://quantumstudio.space/research',
          about: ['Quantum computing', 'Quantum circuit simulation', 'Quantum programming'],
        }}
      />

      <header className="research-page__header">
        <p>Research and experimentation</p>
        <h1>A transparent workspace for quantum circuit studies</h1>
        <div className="research-page__intro">
          Quantum Experiment Studio supports exploratory circuit design, browser-based programming,
          simulation, and state visualization. It is designed for education, prototyping, and
          repeatable small-scale quantum experiments.
        </div>
      </header>

      <div className="research-page__grid">
        <section>
          <span>01</span>
          <h2>Circuit construction</h2>
          <p>Create circuits with single-, multi-, and parameterized quantum gates. The visual builder exposes qubits, operations, circuit depth, and generated code in one workspace.</p>
        </section>
        <section>
          <span>02</span>
          <h2>Simulation and measurement</h2>
          <p>Run shot-based simulations, inspect measurement distributions, and compare circuit behavior while iterating on gate placement and execution settings.</p>
        </section>
        <section>
          <span>03</span>
          <h2>State visualization</h2>
          <p>Study state evolution with step-by-step execution, per-qubit Bloch spheres, a Q-Sphere, and mathematical state representations.</p>
        </section>
        <section>
          <span>04</span>
          <h2>Repeatable examples</h2>
          <p>Start from versioned circuit templates with defined operations and execution settings. Modify them in the builder and retain experiment history when signed in.</p>
        </section>
      </div>

      <section className="research-page__limits">
        <h2>Scope and limitations</h2>
        <p>
          Simulator output models idealized circuit execution unless a selected backend explicitly
          provides different behavior. Results from finite measurement shots are statistical and may
          vary between runs. Hardware availability, queueing, noise, and supported operations depend
          on the selected provider. Validate consequential research results independently and record
          the backend, shot count, circuit, and software version used.
        </p>
      </section>

      <section className="research-page__cta">
        <div><h2>Start with a documented circuit</h2><p>Review an algorithm, then open it in the builder and reproduce each step.</p></div>
        <div><Link to="/templates" className="btn btn--ghost">Browse templates</Link><Link to="/builder" className="btn btn--primary">Open builder</Link></div>
      </section>
    </article>
  );
}
