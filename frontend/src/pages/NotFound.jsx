import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="full-center not-found">
      <h1>Page not found</h1>
      <p>The page you opened does not exist or has moved.</p>
      <Link className="btn primary" to="/dashboard">Go to dashboard</Link>
    </div>
  );
}
