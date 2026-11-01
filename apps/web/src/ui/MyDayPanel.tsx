import { useRecords } from "../api/records.js";

/** My day (DESIGN_SPEC 9): the right drawer's default view, read from the records store. */
export default function MyDayPanel() {
  const myDay = useRecords((s) => s.myDay);
  if (!myDay) return <p className="pan-muted">Loading your day…</p>;
  if (myDay.items.length === 0) return <p className="pan-muted">Nothing scheduled.</p>;
  return (
    <ul className="pan-list">
      {myDay.items.map((item) => (
        <li key={`${item.kind}:${item.id}`} className="pan-item">
          <span className="pan-kind">{item.kind}</span>
          <div>
            <p className="pan-item-title">{item.title}</p>
            <p className="pan-item-reason">{item.reason}</p>
            {item.dueDate && <p className="pan-item-due">Due {item.dueDate}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
