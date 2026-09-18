import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Seo from '../components/Seo';
import { useUserGuide } from '../components/UserGuide/UserGuideProvider';

const features = [
  {
    title: 'Visual circuit builder',
    copy: 'Drag quantum gates onto qubit wires, inspect circuit depth, and generate executable code without installing local tools.',
    link: '/builder',
    action: 'Open circuit builder',
  },
  {
    title: 'Online quantum IDE',
    copy: 'Write and explore quantum programs in a browser-based development environment designed for learning and experimentation.',
    link: '/ide',
    action: 'Open quantum IDE',
  },
  {
    title: 'Interactive simulation',
    copy: 'Run circuits on the simulator and study measurements, state evolution, Bloch spheres, and Q-Sphere visualizations.',
    link: '/builder',
    action: 'Start a simulation',
  },
];

export default function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { startTour } = useUserGuide();
  const description = 'Build, simulate, visualize, and study quantum circuits online with a visual circuit builder, browser-based quantum IDE, Qiskit code generation, and interactive algorithm templates.';

  useEffect(() => {
    if (location.state?.isNewSignup) {
      startTour();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, startTour]);

  return (
    <div className="seo-landing">
      <Seo
        title="Quantum Experiment Studio — Online Quantum IDE & Circuit Builder"
        description={description}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Quantum Experiment Studio',
          url: 'https://quantumstudio.space/',
          description,
          applicationCategory: 'DeveloperApplication',
          applicationSubCategory: 'Quantum computing IDE and circuit simulator',
          operatingSystem: 'Any',
          browserRequirements: 'Requires a modern web browser',
          isAccessibleForFree: true,
          featureList: [
            'Visual quantum circuit builder',
            'Online quantum programming IDE',
            'Quantum circuit simulation',
            'Qiskit code generation',
            'Bloch sphere and Q-Sphere visualization',
            'Quantum algorithm templates',
          ],
        }}
      />

      <header className="seo-landing__hero">
        <p className="seo-landing__eyebrow">Build · Simulate · Understand</p>
        <h1>Quantum computing experiments, directly in your browser</h1>
        <p className="seo-landing__lead">
          Quantum Experiment Studio combines an online quantum IDE, a visual circuit builder, and
          interactive state visualizations for learning, prototyping, and reproducible experiments.
        </p>
        <div className="seo-landing__actions">
          <Link to="/builder" className="btn btn--primary">Build a circuit</Link>
          <Link to="/ide" className="btn btn--ghost">Open the IDE</Link>
          <Link to="/templates" className="btn btn--ghost">Browse templates</Link>
          <button type="button" className="btn btn--ghost" onClick={startTour}>User guide</button>
        </div>
        <p className="seo-landing__note">Run local simulations without creating an account.</p>
      </header>

      <main>
        <section className="seo-landing__features" aria-labelledby="platform-capabilities">
          <div className="seo-landing__section-heading">
            <p>One quantum workspace</p>
            <h2 id="platform-capabilities">From circuit idea to measurement results</h2>
          </div>
          <div className="seo-landing__feature-grid">
            {features.map((feature, index) => (
              <article key={feature.title} className="seo-landing__feature">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <Link to={feature.link}>{feature.action} <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className="seo-landing__research" aria-labelledby="research-heading">
          <div>
            <p className="seo-landing__eyebrow">Learn by experimentation</p>
            <h2 id="research-heading">Explore established quantum algorithms</h2>
            <p>
              Start with documented circuits for superposition, entanglement, quantum teleportation,
              Grover search, the Quantum Fourier Transform, and more. Review each protocol, then load
              it into the builder to inspect and modify every operation.
            </p>
          </div>
          <div className="seo-landing__research-actions">
            <Link to="/research" className="btn btn--ghost">Research capabilities</Link>
            <Link to="/templates" className="btn btn--primary">Browse templates</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
