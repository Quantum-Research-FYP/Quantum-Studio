import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page">
      <h1 className="page__title">404 — Page not found</h1>
      <p className="page__subtitle">The page you are looking for does not exist.</p>
      <Link to="/create" className="btn btn--primary">
        Back to Create
      </Link>
    </div>
  );
}
