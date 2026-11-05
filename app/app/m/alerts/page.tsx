"use client";
// App Alerts tab: which match alerts this phone gets.
import { useEffect, useState } from "react";
import { Empty, MenuGroup, SwitchRow, Title, TopBar } from "@/components/App";
import { ALERTS, alertChoice, hasAlerts, setAlerts, type AlertTopic } from "@/lib/native";

export default function Alerts() {
  const [alerts, setOn] = useState<AlertTopic[] | null>(null);
  const [able, setAble] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const a = hasAlerts(); setAble(a); if (a) setOn(alertChoice() ?? []); }, []);
  const flip = async (t: AlertTopic, on: boolean) => {
    setBusy(true);
    setOn(await setAlerts(on ? [...(alerts ?? []), t] : (alerts ?? []).filter((x) => x !== t)));
    setBusy(false);
  };
  return (
    <>
      <TopBar back="/m/matches/" />
      <Title>Match alerts</Title>
      {able === false && <Empty title="Alerts are in the Android app">Install the app to get match alerts on your phone.</Empty>}
      {alerts && (
        <MenuGroup label="Send me">
          {ALERTS.map((a) => <SwitchRow key={a.topic} title={a.title} on={alerts.includes(a.topic)} disabled={busy} onChange={(v) => flip(a.topic, v)} />)}
        </MenuGroup>
      )}
    </>
  );
}
