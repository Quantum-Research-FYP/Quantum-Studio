import { Link } from 'react-router-dom';

export default function LoginPage() {
  return (
    <div className="page">
      <h1 className="page__title">Log in</h1>
      <p className="page__subtitle">Sign in to your Quantum Studio account.</p>
      <p>
        {"Don't have an account? "}
        <Link to="/signup">Sign up</Link>
      </p>
    </div>
  );
}
