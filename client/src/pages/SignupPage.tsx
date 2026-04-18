import { Link } from 'react-router-dom';

export default function SignupPage() {
  return (
    <div className="page">
      <h1 className="page__title">Sign up</h1>
      <p className="page__subtitle">Create your Quantum Studio account.</p>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
