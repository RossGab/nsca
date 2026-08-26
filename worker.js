self.onmessage = function(e) {
  const { type, data } = e.data;

  if (type === "PROCESS_TASKS") {

    const processed = [];

    for (const t of data) {
      if (t.status === "COMPLETED") continue;

      processed.push({
        ...t,
        _search: (
          (t.CUSTOMERNAME || "") + " " +
          (t.ADDRESS || "") + " " +
          (t.ACCOUNTNUMBER || "") + " " +
          (t.METERNUMBER || "") + " " +
          (t.JOBTYPE || "") + " " +
          (t.BA || "") + " " +
          (t.DMZ || "") + " " +
          (t.MRU || "") + " " +
          (t.driverId || "")
        ).toLowerCase()
      });
    }

    self.postMessage({
      type: "DONE",
      data: processed
    });
  }
};
