import type { ServiceName } from '@3dx/contracts';
import { useEffect, useState } from 'react';
import { checkHealth, type ServiceStatus } from './service-status';

const SERVICES: { name: ServiceName; label: string; url: string }[] = [
  { name: 'api', label: 'API', url: '/api/health' },
  { name: 'realtime', label: 'Realtime', url: '/realtime/health' },
];

/** Painel de diagnóstico com o health check dos serviços de backend. */
export function ServiceStatusPanel() {
  const [statuses, setStatuses] = useState<Record<ServiceName, ServiceStatus>>({
    api: { state: 'checking' },
    realtime: { state: 'checking' },
  });

  useEffect(() => {
    const controller = new AbortController();
    for (const service of SERVICES) {
      void checkHealth(service.url, service.name, controller.signal).then((status) => {
        if (!controller.signal.aborted) {
          setStatuses((current) => ({ ...current, [service.name]: status }));
        }
      });
    }
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <ul className="hud-panel services" aria-label="Status dos serviços">
      {SERVICES.map((service) => (
        <li key={service.name}>
          <span>{service.label}</span>
          <StatusLabel status={statuses[service.name]} />
        </li>
      ))}
    </ul>
  );
}

function StatusLabel({ status }: { status: ServiceStatus }) {
  switch (status.state) {
    case 'checking':
      return <span className="status">verificando…</span>;
    case 'ok':
      return <span className="status status-ok">ok</span>;
    case 'error':
      return <span className="status status-error">indisponível ({status.message})</span>;
  }
}
