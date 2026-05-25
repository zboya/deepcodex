export namespace apiclient {
	
	export class ModelInfo {
	    id: string;
	    displayName?: string;
	    provider?: string;
	    source?: string;
	
	    static createFrom(source: any = {}) {
	        return new ModelInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.displayName = source["displayName"];
	        this.provider = source["provider"];
	        this.source = source["source"];
	    }
	}
	export class ProviderTemplate {
	    name: string;
	    kind: string;
	    displayName: string;
	    baseUrl: string;
	    models: string[];
	    defaultModel: string;
	    authEnv?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProviderTemplate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.displayName = source["displayName"];
	        this.baseUrl = source["baseUrl"];
	        this.models = source["models"];
	        this.defaultModel = source["defaultModel"];
	        this.authEnv = source["authEnv"];
	    }
	}
	export class ProviderConfig {
	    apiKey?: string;
	    authToken?: string;
	    models?: string[];
	    defaultModel?: string;
	    enabled: boolean;
	    createdAt?: number;
	    updatedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new ProviderConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.authToken = source["authToken"];
	        this.models = source["models"];
	        this.defaultModel = source["defaultModel"];
	        this.enabled = source["enabled"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ProvidersConfig {
	    version: number;
	    activeProvider?: string;
	    providers: ProviderConfig[];
	
	    static createFrom(source: any = {}) {
	        return new ProvidersConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.activeProvider = source["activeProvider"];
	        this.providers = this.convertValues(source["providers"], ProviderConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class ChatItem {
	    id: string;
	    title: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ChatItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class Message {
	    id: string;
	    role: string;
	    content: string;
	    time: number;
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.role = source["role"];
	        this.content = source["content"];
	        this.time = source["time"];
	    }
	}
	export class Project {
	    id: string;
	    name: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	    }
	}

}

