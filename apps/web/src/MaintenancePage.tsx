import { ErrorScreen } from "./ErrorScreen";

// The maintenance page. The app decides when to show it and when to leave it.
export function MaintenancePage({
  message,
  onCheck,
}: {
  message: string;
  onCheck: () => void;
}) {
  return (
    <ErrorScreen
      title="Maintenance"
      message={message || "Akeru is under maintenance. Please try again later."}
    >
      <button className="pill-btn err-btn" onClick={onCheck}>
        Check again
      </button>
    </ErrorScreen>
  );
}
