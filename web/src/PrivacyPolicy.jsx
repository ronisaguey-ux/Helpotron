/**
 * PrivacyPolicy.jsx — Backward compatibility shim delegating to PrivacyPolicyView.jsx
 */
import PrivacyPolicyView from './components/PrivacyPolicyView.jsx';

export default function PrivacyPolicy(props) {
  return <PrivacyPolicyView {...props} />;
}
