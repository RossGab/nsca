import {collection, doc, getDoc, getDocs, query, where} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {taskCompletion} from "./driver-earnings.js";

export function confirmationId(driverId, from, to) {
  return [encodeURIComponent(driverId), from, to].join("|");
}

export async function taskFingerprint(tasks) {
  const ordered = tasks.map(task => [task.taskId, task.completedAtMs])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(ordered)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function adminConfirmationMatches(record, fingerprint, count) {
  const admin = record?.admin;
  return admin?.status === "CONFIRMED" && admin.fingerprint === fingerprint && admin.count === count;
}

export async function eligibleDriverTasks(db, linked, from, to) {
  const end = new Date(to + "T00:00:00+08:00");
  end.setTime(end.getTime() + 86400000);
  const snapshot = await getDocs(query(collection(db, "TASK"),
    where("completedAt", ">=", new Date(from + "T00:00:00+08:00")),
    where("completedAt", "<", end)));
  const tasks = [];
  for (const record of snapshot.docs) {
    const completion = taskCompletion(record.data());
    const driver = linked.get(completion?.driverId);
    if (driver && (!driver.startDate || completion.date >= driver.startDate)) {
      tasks.push({taskId: record.id, ...completion});
    }
  }
  const unclaimed = [];
  for (let start = 0; start < tasks.length; start += 50) {
    const batch = tasks.slice(start, start + 50);
    const claims = await Promise.all(batch.map(task => getDoc(doc(db, "payrollTaskClaims", task.taskId))));
    batch.forEach((task, index) => {
      if (!claims[index].exists()) unclaimed.push(task);
    });
  }
  return unclaimed;
}
