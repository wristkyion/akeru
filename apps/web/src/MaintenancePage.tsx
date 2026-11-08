// The black maintenance page. It only displays the message and a check button.
// The app decides when to show it, and when to leave it.
export function MaintenancePage({
  message,
  onCheck,
}: {
  message: string;
  onCheck: () => void;
}) {
  return (
    <div className="maintenance">
      <h1>Maintenance</h1>
      <p>{message || "Akeru is under maintenance. Please try again later."}</p>
      <button className="pill-btn" onClick={onCheck}>
        Check again
      </button>
    </div>
  );
}