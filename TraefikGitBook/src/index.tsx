import {
  createIntegration,
  createComponent,
  FetchEventCallback,
  RuntimeContext,
} from "@gitbook/runtime";

type IntegrationContext = {} & RuntimeContext;

type IntegrationBlockProps = {};

type TraefikService = {
  name: string;
  serverStatus?: Record<string, string>;
  loadBalancer?: any;
};

type IntegrationBlockState = {
  services: Array<{
    name: string;
    url: string;
    status: 'UP' | 'DOWN' | 'UNKNOWN';
  }>;
  lastFetched: number;
  error?: string;
  _forceUpdate?: number;
};

type IntegrationAction = { action: "refresh" };

const CACHE_DURATION_MS = 30000; // 30 seconds

const MONITORED_SERVICES = [
  {
    serviceKey: "discoveries@docker",
    displayName: "Discoveries",
    url: "discoveriesguild.com"
  },
  {
    serviceKey: "portainer@docker",
    displayName: "Portainer",
    url: "portainer.deloop.se"
  }
];

const handleFetchEvent: FetchEventCallback<IntegrationContext> = async (
  request,
  context
) => {
  const { api } = context;
  const user = api.user.getAuthenticatedUser();
  return new Response(JSON.stringify(user));
};

const traefikStatusBlock = createComponent<
  IntegrationBlockProps,
  IntegrationBlockState,
  IntegrationAction,
  IntegrationContext
>({
  componentId: "traefikgitbook",
  initialState: (props) => {
    return {
      services: MONITORED_SERVICES.map(svc => ({
        name: svc.displayName,
        url: svc.url,
        status: 'UNKNOWN' as const
      })),
      lastFetched: 0,
    };
  },
  
  action: async (element, action, context) => {
    switch (action.action) {
      case "refresh":
        return {
          state: {
            ...element.state,
            lastFetched: 0,
            _forceUpdate: Date.now()
          }
        };
    }
  },
  
  render: async (element, context) => {
    const now = Date.now();
    const shouldFetch = now - element.state.lastFetched > CACHE_DURATION_MS;
    
    let newState = element.state;
    
    if (shouldFetch) {
      try {
        const apiUrl = context.environment.installation?.configuration?.traefik_api_url;
        const username = context.environment.installation?.configuration?.traefik_username;
        const password = context.environment.installation?.configuration?.traefik_password;
        
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': 'Basic ' + btoa(`${username}:${password}`)
          }
        });
        
        if (!response.ok) {
          throw new Error(`Traefik API returned ${response.status}`);
        }
        
        const servicesData = await response.json() as TraefikService[];
        
        const updatedServices = MONITORED_SERVICES.map(monitoredSvc => {
          const foundService = servicesData.find((svc: TraefikService) => svc.name === monitoredSvc.serviceKey);
          
          let status: 'UP' | 'DOWN' | 'UNKNOWN' = 'DOWN';
          
          if (foundService && foundService.serverStatus) {
            const serverStatuses = Object.values(foundService.serverStatus);
            status = serverStatuses.some((s: string) => s === 'UP') ? 'UP' : 'DOWN';
          }
          
          return {
            name: monitoredSvc.displayName,
            url: monitoredSvc.url,
            status
          };
        });
        
        newState = {
          services: updatedServices,
          lastFetched: now,
          error: undefined
        };
        
      } catch (error) {
        newState = {
          ...element.state,
          lastFetched: now,
          error: error instanceof Error ? error.message : 'Failed to fetch status'
        };
      }
    }
    
    const getRelativeTime = (timestamp: number): string => {
      if (timestamp === 0) return 'Never';
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      if (seconds < 60) return 'Just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
      return `${Math.floor(seconds / 3600)} hours ago`;
    };

    const lastUpdated = getRelativeTime(newState.lastFetched);
    
    return (
      <block>
        <vstack>
          <box>
            <text style="bold">Traefik Service Status</text>
          </box>
          <box>
            <text style="italic">Last updated: {lastUpdated}</text>
          </box>
          
          {newState.error ? (
            <box>
              <text>⚠️ Error: {newState.error}</text>
            </box>
          ) : null}
          
          <divider />
          
          {newState.services.map((service) => (
            <card title={service.name}>
              <text>
                Status: {service.status === 'UP' ? '🟢 UP' : '🔴 DOWN'}
              </text>
            </card>
          ))}
          
          <box>
            <button 
              label="Refresh Now" 
              onPress={{ action: "refresh" }}
              style="secondary"
            />
          </box>
        </vstack>
      </block>
    );
  },
});

export default createIntegration({
  fetch: handleFetchEvent,
  components: [traefikStatusBlock],
  events: {},
});
