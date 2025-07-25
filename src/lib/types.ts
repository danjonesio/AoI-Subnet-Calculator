// Core types for subnet management functionality

// IP Version and Cloud Mode types (existing in main component, now centralized)
export type IPVersion = "ipv4" | "ipv6";
export type CloudMode = "normal" | "aws" | "azure" | "gcp";

// Cloud reservation interface (existing in main component, now centralized)
export interface CloudReservation {
  ip: string;
  purpose: string;
  description: string;
}

// Enhanced SubnetInfo interface for compatibility with existing code
export interface SubnetInfo {
  id?: string; // Optional ID for subnet management
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  subnetMask: string;
  wildcardMask: string;
  totalHosts: number;
  usableHosts: number;
  cidr: string;
  cloudReserved?: {
    provider: string;
    reservations: CloudReservation[];
  };
  ipv6Info?: {
    addressType: string;
    hostBits: number;
    totalAddressesFormatted: string;
    usableAddressesFormatted: string;
  };
  level?: number; // Hierarchy level for subnet management
  parentId?: string; // Parent subnet ID for hierarchy
}

// Split subnet interface for subnet management
export interface SplitSubnet {
  id: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  cidr: number;
  totalHosts: number;
  usableHosts: number;
  parentId?: string;
  level: number;
  isSelected: boolean;
  cloudReserved?: CloudReservation[];
  ipVersion: IPVersion;
  // IPv6 specific fields
  ipv6Info?: {
    addressType: string;
    hostBits: number;
    totalAddressesFormatted: string;
    usableAddressesFormatted: string;
  };
}

// Subnet operation types for history tracking
export type SubnetOperationType = 'split' | 'join' | 'reset';

// Subnet operation interface for tracking changes
export interface SubnetOperation {
  id: string;
  type: SubnetOperationType;
  timestamp: number;
  sourceSubnets: string[]; // IDs of source subnets
  resultSubnets: SplitSubnet[]; // Resulting subnets after operation
  description: string;
  ipVersion: IPVersion;
  cloudMode: CloudMode;
}

// Split options interface for configuring subnet splitting
export interface SplitOptions {
  splitType: 'equal' | 'custom';
  splitCount?: number; // For equal splits (2, 4, 8, etc.)
  customCidr?: number; // For custom CIDR splits
  maxResults?: number; // Limit for performance
  preserveOrder?: boolean; // Whether to maintain address order
}

// Join options interface for configuring subnet joining
export interface JoinOptions {
  validateAdjacency: boolean; // Whether to validate subnet adjacency
  allowDifferentSizes: boolean; // Whether to allow joining different sized subnets
  preserveMetadata: boolean; // Whether to preserve original subnet metadata
}

// Subnet management state interface
export interface SubnetManagementState {
  splitSubnets: SplitSubnet[];
  selectedSubnets: Set<string>;
  operationHistory: SubnetOperation[];
  isLoading: boolean;
  error: string | null;
  originalSubnet: SubnetInfo | null;
  currentView: 'list' | 'tree';
  sortBy: 'network' | 'cidr' | 'hosts' | 'created';
  sortOrder: 'asc' | 'desc';
  filterText: string;
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}

// Subnet calculation result interface
export interface SubnetCalculationResult {
  subnets: SplitSubnet[];
  totalSubnets: number;
  totalAddresses: number;
  usableAddresses: number;
  performance: {
    calculationTime: number;
    memoryUsage?: number;
  };
}

// Export functionality interfaces
export interface ExportOptions {
  format: 'text' | 'csv' | 'json' | 'yaml';
  includeHeaders: boolean;
  includeMetadata: boolean;
  selectedOnly: boolean;
  compression?: boolean;
}

export interface ExportResult {
  data: string;
  filename: string;
  mimeType: string;
  size: number;
}

// Performance monitoring interface
export interface PerformanceMetrics {
  operationType: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryBefore?: number;
  memoryAfter?: number;
  itemsProcessed: number;
}

// Error types for better error handling
export type SubnetErrorType = 
  | 'validation'
  | 'calculation'
  | 'performance'
  | 'network'
  | 'export'
  | 'import';

export interface SubnetError {
  type: SubnetErrorType;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp: number;
  recoverable: boolean;
}

// Component prop interfaces for type safety

export interface SubnetSplitterProps {
  parentSubnet: SubnetInfo;
  ipVersion: IPVersion;
  cloudMode: CloudMode;
  onSplit: (subnets: SplitSubnet[], operation: SubnetOperation) => void;
  onError: (error: SubnetError) => void;
  disabled?: boolean;
  maxSubnets?: number;
}

export interface SubnetJoinerProps {
  availableSubnets: SplitSubnet[];
  selectedSubnets: Set<string>;
  ipVersion: IPVersion;
  onSelectionChange: (selected: Set<string>) => void;
  onJoin: (joinedSubnet: SplitSubnet, operation: SubnetOperation) => void;
  onError: (error: SubnetError) => void;
  disabled?: boolean;
}

export interface SubnetListProps {
  subnets: SplitSubnet[];
  selectedSubnets: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onSort: (field: string, order: 'asc' | 'desc') => void;
  onFilter: (filterText: string) => void;
  onExport: (options: ExportOptions) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  filterText: string;
  loading?: boolean;
}

export interface SubnetTreeProps {
  subnets: SplitSubnet[];
  selectedSubnets: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onExpand: (subnetId: string) => void;
  expandedNodes: Set<string>;
  showRelationships?: boolean;
}

export interface SubnetExportProps {
  subnets: SplitSubnet[];
  selectedSubnets: Set<string>;
  onExport: (result: ExportResult) => void;
  onError: (error: SubnetError) => void;
  availableFormats: ExportOptions['format'][];
}

// Utility type for subnet hierarchy
export interface SubnetHierarchy {
  subnet: SplitSubnet;
  children: SubnetHierarchy[];
  depth: number;
  isExpanded: boolean;
}

// Configuration interfaces
export interface SubnetManagementConfig {
  maxSubnetsPerSplit: number;
  maxOperationHistory: number;
  enablePerformanceMonitoring: boolean;
  defaultExportFormat: ExportOptions['format'];
  autoSaveState: boolean;
  virtualScrollThreshold: number;
}

// Theme and styling interfaces
export interface SubnetDisplayTheme {
  primaryColor: string;
  secondaryColor: string;
  errorColor: string;
  warningColor: string;
  successColor: string;
  fontFamily: string;
  fontSize: string;
}