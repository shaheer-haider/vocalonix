import { useState } from "react";

import { Alert, Box, Pill } from "../components/ui";
import { WorkspaceShell } from "./business";

interface DiaryEntry {
  time: string;
  duration: string;
  name: string;
  service: string;
  person: string;
  status: "booked" | "held" | "kept-free" | "done";
}

const diaryPeople = ["Everyone", "Dr. Reyes", "Dr. Osei", "Aleks"] as const;

const diaryEntries: DiaryEntry[] = [
  { time: "8:00", duration: "30 min", name: "Ade Fashola", service: "Check-up", person: "Dr. Reyes", status: "done" },
  { time: "8:00", duration: "30 min", name: "Grace Odum", service: "Hygiene", person: "Aleks", status: "done" },
  { time: "9:00", duration: "30 min", name: "Emergency slot", service: "Kept free", person: "Dr. Reyes", status: "kept-free" },
  { time: "9:00", duration: "45 min", name: "Elena Fox", service: "Whitening consult", person: "Dr. Osei", status: "done" },
  { time: "9:40", duration: "30 min", name: "Nadia Kaur", service: "Check-up", person: "Dr. Reyes", status: "booked" },
  { time: "10:30", duration: "20 min", name: "Marcus Bell", service: "Slot held on the phone", person: "Dr. Osei", status: "held" },
  { time: "11:00", duration: "30 min", name: "Iris Bhatt", service: "Check-up — booked by the agent", person: "Dr. Osei", status: "booked" },
  { time: "14:00", duration: "60 min", name: "Dawn Whitfield", service: "Root canal follow-up", person: "Dr. Reyes", status: "booked" },
];

function statusPill(status: DiaryEntry["status"]) {
  switch (status) {
    case "done":
      return <Pill variant="good">Done</Pill>;
    case "held":
      return <Pill variant="warn">Held</Pill>;
    case "kept-free":
      return <Pill>Kept free</Pill>;
    default:
      return <Pill variant="info">Booked</Pill>;
  }
}

export function WorkspaceBookingsPage() {
  const [person, setPerson] = useState<(typeof diaryPeople)[number]>("Everyone");
  const entries =
    person === "Everyone"
      ? diaryEntries
      : diaryEntries.filter((entry) => entry.person === person);

  return (
    <WorkspaceShell>
      {() => (
        <>
          <Alert variant="warn">
            Design preview — the bookings diary shows sample data while the
            booking backend is being built.
          </Alert>
          <div className="ops-toolbar">
            {diaryPeople.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`ops-chip ${person === candidate ? "ops-chip--active" : ""}`.trim()}
                onClick={() => setPerson(candidate)}
              >
                {candidate}
              </button>
            ))}
          </div>
          <Box style={{ padding: 0, overflow: "hidden" }}>
            {entries.map((entry) => (
              <div className="ops-row" key={`${entry.time}-${entry.name}`}>
                <div className="ops-row__time">
                  <span>{entry.time}</span>
                  <span className="ops-row__meta">{entry.duration}</span>
                </div>
                <div className="ops-row__body">
                  <span className="ops-row__title">{entry.name}</span>
                  <span className="ops-row__meta">
                    {entry.service} · {entry.person}
                  </span>
                </div>
                {statusPill(entry.status)}
              </div>
            ))}
          </Box>
        </>
      )}
    </WorkspaceShell>
  );
}

interface CallbackTask {
  bucket: string;
  name: string;
  reason: string;
  due: string;
  source: string;
  owner: string;
}

const callbackTasks: CallbackTask[] = [
  { bucket: "Late", name: "Dawn Whitfield", reason: "Promised a call about her follow-up this morning", due: "was due 9:00", source: "Call", owner: "You" },
  { bucket: "Within the hour", name: "Marcus Bell", reason: "Holding a 3:20 slot — confirm before it lapses", due: "due 12:40", source: "Bookings waitlist", owner: "Priya" },
  { bucket: "Within the hour", name: "Sam Okafor", reason: "Asked about Delta Dental cover", due: "due 13:00", source: "Call", owner: "Nobody yet" },
  { bucket: "Later today", name: "Elena Fox", reason: "Whitening quote to send after her consult", due: "due 16:30", source: "Front desk", owner: "You" },
  { bucket: "Tomorrow and after", name: "Grace Odum", reason: "No-show — offer a new hygiene slot", due: "tomorrow 9:00", source: "No-show", owner: "Priya" },
];

const callbackBuckets = [
  "Late",
  "Within the hour",
  "Later today",
  "Tomorrow and after",
];

export function WorkspaceCallbacksPage() {
  return (
    <WorkspaceShell>
      {() => (
        <>
          <Alert variant="warn">
            Design preview — the callbacks queue shows sample data while the
            callback backend is being built.
          </Alert>
          {callbackBuckets.map((bucket) => {
            const tasks = callbackTasks.filter((task) => task.bucket === bucket);
            if (tasks.length === 0) return null;
            return (
              <section className="ops-bucket" key={bucket}>
                <p className="nav-section">{bucket}</p>
                <Box style={{ padding: 0, overflow: "hidden" }}>
                  {tasks.map((task) => (
                    <div className="ops-row" key={task.name}>
                      <div className="ops-row__body">
                        <span className="ops-row__title">{task.name}</span>
                        <span className="ops-row__meta">{task.reason}</span>
                      </div>
                      <span className="ops-row__meta">{task.source}</span>
                      <Pill variant={bucket === "Late" ? "accent" : "info"}>
                        {task.due}
                      </Pill>
                      <Pill>{task.owner}</Pill>
                    </div>
                  ))}
                </Box>
              </section>
            );
          })}
        </>
      )}
    </WorkspaceShell>
  );
}
