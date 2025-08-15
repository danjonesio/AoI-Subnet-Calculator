"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Github, Newspaper, AlertCircle, Loader2, Info } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { validateIPv6, compressIPv6, validateIPv6CIDR, calculateIPv6Subnet, getIPv6SubnetSummary } from "@/lib/utils";
import {
  CloudMode,
  IPVersion,
  SplitSubnet,
  SubnetOperation,
  SubnetError
} from "@/lib/types";
import { debounce, throttle, performanceMonitor } from "@/lib/performance";
import { SubnetSplitter } from "@/components/subnet-management/subnet-splitter";
import { SubnetJoiner } from "@/components/subnet-management/subnet-joiner";
import { SubnetTree } from "@/components/subnet-management/subnet-tree";
import { SubnetList } from "@/components/subnet-management/subnet-list";
import { SubnetExport } from "@/components/subnet-management/subnet-export";
import { SubnetErrorBoundary } from "@/components/subnet-management/subnet-error-boundary";
import {
  LoadingSpinner,
  SubnetSplitterSkeleton,
  SubnetJoinerSkeleton,
  SubnetListSkeleton
} from "@/components/subnet-management/loading-states";

interface CloudReservation {
  ip: string;
  purpose: string;
  description: string;
}

interface SubnetInfo {
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
}

interface CloudProviderConfig {
  name: string;
  minCidr: number;
  maxCidr: number;
  reservedCount: number;
  firstUsableOffset: number;
  getReservations: (networkInt: number, broadcastInt: number, intToIp: (int: number) => string) => CloudReservation[];
}

// Cloud provider configurations
const CLOUD_PROVIDERS: Record<Exclude<CloudMode, "normal">, CloudProviderConfig> = {
  aws: {
    name: "AWS",
    minCidr: 16,
    maxCidr: 28,
    reservedCount: 5,
    firstUsableOffset: 4,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "VPC Router", description: "Reserved for the VPC router" },
      { ip: intToIp(networkInt + 2), purpose: "DNS Server", description: "Reserved for DNS server" },
      { ip: intToIp(networkInt + 3), purpose: "Future Use", description: "Reserved for future use" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  },
  azure: {
    name: "Azure",
    minCidr: 8,
    maxCidr: 29,
    reservedCount: 5,
    firstUsableOffset: 4,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "Default Gateway", description: "Reserved for default gateway" },
      { ip: intToIp(networkInt + 2), purpose: "DNS Mapping", description: "Reserved for Azure DNS" },
      { ip: intToIp(networkInt + 3), purpose: "DNS Mapping", description: "Reserved for Azure DNS" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  },
  gcp: {
    name: "Google Cloud",
    minCidr: 8,
    maxCidr: 29,
    reservedCount: 4,
    firstUsableOffset: 2,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "Default Gateway", description: "Reserved for default gateway" },
      { ip: intToIp(broadcastInt - 1), purpose: "Second-to-last IP", description: "Reserved by Google Cloud" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  }
};

export default function SubnetCalculator() {
  const [ipAddress, setIpAddress] = useState("192.168.1.0");
  const [cidr, setCidr] = useState("24");
  const [mode, setMode] = useState("normal");
  const [ipVersion, setIpVersion] = useState<IPVersion>("ipv4");
  const [subnetInfo, setSubnetInfo] = useState<SubnetInfo | null>(null);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  // Subnet Management State - Enhanced for advanced subnet management
  const [splitSubnets, setSplitSubnets] = useState<SplitSubnet[]>([]);
  const [selectedSubnets, setSelectedSubnets] = useState<Set<string>>(new Set());
  // const [splitHistory, setSplitHistory] = useState<SubnetOperation[]>([]);
  const [isSubnetLoading, setIsSubnetLoading] = useState(false);
  const [subnetError, setSubnetError] = useState<string | null>(null);

  // Additional state for enhanced subnet management
  const [currentView, setCurrentView] = useState<'list' | 'tree'>('list');
  const [sortBy, setSortBy] = useState<'network' | 'cidr' | 'hosts' | 'created'>('network');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState<string>('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Performance optimization: debounced validation and calculation
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateIP = useCallback((ip: string): boolean => {
    if (ipVersion === "ipv4") {
      const parts = ip.split(".");
      if (parts.length !== 4) return false;
      return parts.every(part => {
        const num = parseInt(part);
        return !isNaN(num) && num >= 0 && num <= 255;
      });
    } else {
      return validateIPv6(ip);
    }
  }, [ipVersion]);

  const validateCIDR = useCallback((cidr: string): boolean => {
    const num = parseInt(cidr);
    if (isNaN(num)) return false;

    if (ipVersion === "ipv6") {
      return validateIPv6CIDR(cidr);
    }

    if (mode === "normal") {
      return num >= 0 && num <= 32;
    }

    const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
    return provider ? num >= provider.minCidr && num <= provider.maxCidr : false;
  }, [mode, ipVersion]);

  // Debounced validation functions for real-time input validation
  const debouncedValidateIP = useCallback(
    (ip: string) => {
      const debouncedFn = debounce(() => {
        setIsValidating(true);
        const monitor = performanceMonitor.startOperation('ip_validation');

        try {
          const isValid = validateIP(ip);
          if (!isValid && ip.length > 0) {
            if (ipVersion === "ipv4") {
              const parts = ip.split(".");
              if (parts.length !== 4) {
                setError("IP address must have exactly 4 octets separated by dots");
              } else if (parts.some(part => part === "" || isNaN(parseInt(part)))) {
                setError("All IP address octets must be valid numbers");
              } else if (parts.some(part => parseInt(part) < 0 || parseInt(part) > 255)) {
                setError("IP address octets must be between 0 and 255");
              } else {
                setError("Invalid IP address format");
              }
            } else {
              setError("Invalid IPv6 address format");
            }
          } else if (isValid) {
            setError("");
          }
        } catch (error) {
          console.error('IP validation error:', error);
          setError("Error validating IP address");
        } finally {
          monitor.end();
          setIsValidating(false);
        }
      }, 300);
      debouncedFn();
    },
    [validateIP, ipVersion]
  );

  const debouncedValidateCIDR = useCallback(
    (cidrValue: string) => {
      const debouncedFn = debounce(() => {
        setIsValidating(true);
        const monitor = performanceMonitor.startOperation('cidr_validation');

        try {
          const isValid = validateCIDR(cidrValue);
          if (!isValid && cidrValue.length > 0) {
            if (ipVersion === "ipv6") {
              setError("IPv6 CIDR must be between 0 and 128");
            } else if (mode === "normal") {
              setError("CIDR must be between 0 and 32");
            } else {
              const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
              if (provider) {
                const minHosts = Math.pow(2, 32 - provider.maxCidr);
                setError(`${provider.name} subnets require CIDR between /${provider.minCidr} and /${provider.maxCidr} (minimum ${minHosts} IP addresses)`);
              }
            }
          } else if (isValid) {
            setError("");
          }
        } catch (error) {
          console.error('CIDR validation error:', error);
          setError("Error validating CIDR");
        } finally {
          monitor.end();
          setIsValidating(false);
        }
      }, 300);
      debouncedFn();
    },
    [validateCIDR, ipVersion, mode]
  );



  const ipToInt = (ip: string): number => {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  };

  const intToIp = (int: number): string => {
    return [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255
    ].join(".");
  };

  // Subnet Management State Update Functions - Enhanced for task 4.2
  const addSplitSubnets = useCallback((newSubnets: SplitSubnet[], operation: SubnetOperation) => {
    setIsSubnetLoading(true);
    try {
      if (operation.type === 'split') {
        // For split operations, replace existing subnets to avoid duplicates
        // This handles the case where user clicks "Split Subnets" multiple times
        setSplitSubnets(newSubnets);
        // Clear selection since we're replacing all subnets
        setSelectedSubnets(new Set());
      } else {
        // For other operations (like join results), append to existing
        setSplitSubnets(prev => [...prev, ...newSubnets]);
      }
      // setSplitHistory(prev => [...prev, operation]); // Commented out as splitHistory state is not active
      setSubnetError(null);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to add split subnets');
    } finally {
      setIsSubnetLoading(false);
    }
  }, []);

  const removeSubnets = useCallback((subnetIds: string[], operation: SubnetOperation) => {
    setIsSubnetLoading(true);
    try {
      setSplitSubnets(prev => prev.filter(subnet => !subnetIds.includes(subnet.id)));
      setSelectedSubnets(prev => {
        const newSelected = new Set(prev);
        subnetIds.forEach(id => newSelected.delete(id));
        return newSelected;
      });
      // setSplitHistory(prev => [...prev, operation]); // Commented out as splitHistory state is not active
      setSubnetError(null);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to remove subnets');
    } finally {
      setIsSubnetLoading(false);
    }
  }, []);



  const resetSubnetManagement = useCallback(() => {
    try {
      setSplitSubnets([]);
      setSelectedSubnets(new Set());
      // setSplitHistory([]);
      setIsSubnetLoading(false);
      setSubnetError(null);
      setCurrentView('list');
      setSortBy('network');
      setSortOrder('asc');
      setFilterText('');
      setExpandedNodes(new Set());
    } catch (error) {
      console.error('Error resetting subnet management:', error);
      setSubnetError('Failed to reset subnet management');
    }
  }, []);



  const selectAllSubnets = useCallback(() => {
    try {
      const allSubnetIds = splitSubnets.map(subnet => subnet.id);
      setSelectedSubnets(new Set(allSubnetIds));
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to select all subnets');
    }
  }, [splitSubnets]);

  const clearSubnetSelection = useCallback(() => {
    try {
      setSelectedSubnets(new Set());
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to clear subnet selection');
    }
  }, []);



  const updateSubnetSort = useCallback((field: string, order: 'asc' | 'desc') => {
    try {
      setSortBy(field as 'network' | 'cidr' | 'hosts' | 'created');
      setSortOrder(order);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to update sort');
    }
  }, []);

  const updateSubnetFilter = useCallback((filter: string) => {
    try {
      setFilterText(filter);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to update filter');
    }
  }, []);





  const calculateSubnet = useCallback(() => {
    try {
      setError("");

      // Input validation with enhanced error handling
      if (!ipAddress || typeof ipAddress !== 'string') {
        setError("IP address is required");
        return;
      }

      if (!cidr || typeof cidr !== 'string') {
        setError("CIDR prefix is required");
        return;
      }

      // Enhanced IP validation with specific error messages
      if (!validateIP(ipAddress)) {
        if (ipVersion === "ipv4") {
          const parts = ipAddress.split(".");
          if (parts.length !== 4) {
            setError("IP address must have exactly 4 octets separated by dots");
          } else if (parts.some(part => part === "" || isNaN(parseInt(part)))) {
            setError("All IP address octets must be valid numbers");
          } else if (parts.some(part => parseInt(part) < 0 || parseInt(part) > 255)) {
            setError("IP address octets must be between 0 and 255");
          } else {
            setError("Invalid IP address format");
          }
        } else {
          setError("Invalid IPv6 address format");
        }
        return;
      }

      if (!validateCIDR(cidr)) {
        if (ipVersion === "ipv6") {
          setError("IPv6 CIDR must be between 0 and 128");
        } else if (mode === "normal") {
          setError("CIDR must be between 0 and 32");
        } else {
          const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
          if (provider) {
            const minHosts = Math.pow(2, 32 - provider.maxCidr);
            setError(`${provider.name} subnets require CIDR between /${provider.minCidr} and /${provider.maxCidr} (minimum ${minHosts} IP addresses)`);
          }
        }
        return;
      }

      // Handle IPv6 calculations
      if (ipVersion === "ipv6") {
        const cidrNum = parseInt(cidr);
        const ipv6Subnet = calculateIPv6Subnet(ipAddress, cidrNum);
        const ipv6Summary = getIPv6SubnetSummary(ipAddress, cidrNum);

        // Ensure IPv6 addresses are properly compressed for display
        const compressedNetwork = compressIPv6(ipv6Subnet.network);
        const compressedFirstHost = compressIPv6(ipv6Subnet.firstHost);
        const compressedLastHost = compressIPv6(ipv6Subnet.lastHost);

        const calculatedIPv6Subnet = {
          network: compressedNetwork,
          broadcast: "N/A (IPv6 has no broadcast address)",
          firstHost: compressedFirstHost,
          lastHost: compressedLastHost,
          subnetMask: "N/A (IPv6 uses prefix length)",
          wildcardMask: "N/A (IPv6 uses prefix length)",
          totalHosts: Number(ipv6Subnet.totalAddresses > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : ipv6Subnet.totalAddresses),
          usableHosts: Number(ipv6Subnet.usableAddresses > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : ipv6Subnet.usableAddresses),
          cidr: `/${cidr}`,
          // Store additional IPv6-specific information for enhanced display
          ipv6Info: {
            addressType: ipv6Summary.addressType,
            hostBits: ipv6Summary.hostBits,
            totalAddressesFormatted: ipv6Summary.totalAddresses,
            usableAddressesFormatted: ipv6Summary.usableAddresses
          }
        };

        setSubnetInfo(calculatedIPv6Subnet);
        return;
      }

      const cidrNum = parseInt(cidr);

      // Enhanced CIDR validation with edge case handling
      if (isNaN(cidrNum) || cidrNum < 0 || cidrNum > 32) {
        setError("CIDR prefix must be a number between 0 and 32");
        return;
      }

      const hostBits = 32 - cidrNum;

      // Handle edge case for /0 subnet (entire IPv4 space) - should be allowed in normal mode
      if (hostBits >= 32) {
        setError("Invalid subnet calculation: host bits exceed 32");
        return;
      }

      // Enhanced bitwise operations with overflow protection
      let subnetMask: number;
      let wildcardMask: number;

      try {
        subnetMask = hostBits >= 32 ? 0 : (0xFFFFFFFF << hostBits) >>> 0;
        wildcardMask = ~subnetMask >>> 0;

        // Validate mask calculations
        if (isNaN(subnetMask) || isNaN(wildcardMask)) {
          throw new Error("Invalid subnet mask calculation");
        }
      } catch (maskError) {
        console.error("Subnet mask calculation error:", maskError);
        setError("Error calculating subnet mask. Please verify your CIDR input.");
        return;
      }

      let ipInt: number;
      try {
        ipInt = ipToInt(ipAddress);

        // Enhanced IP conversion validation
        if (isNaN(ipInt) || ipInt < 0 || ipInt > 0xFFFFFFFF) {
          throw new Error("IP address conversion out of bounds");
        }
      } catch (ipError) {
        console.error("IP conversion error:", ipError);
        setError("Error converting IP address. Please check the format.");
        return;
      }

      let networkInt: number;
      let broadcastInt: number;

      try {
        networkInt = (ipInt & subnetMask) >>> 0;
        broadcastInt = (networkInt | wildcardMask) >>> 0;

        // Enhanced network calculation validation
        if (networkInt > broadcastInt) {
          throw new Error("Network address exceeds broadcast address");
        }

        if (isNaN(networkInt) || isNaN(broadcastInt)) {
          throw new Error("Invalid network address calculation");
        }
      } catch (networkError) {
        console.error("Network calculation error:", networkError);
        setError("Error calculating network addresses. Please verify your inputs.");
        return;
      }

      // Enhanced host calculation with overflow protection
      let totalHosts: number;
      let usableHosts: number;

      try {
        // Handle very large subnets more safely
        if (hostBits >= 31) {
          totalHosts = Math.pow(2, 31); // Cap at 2^31 to prevent overflow
        } else {
          totalHosts = Math.pow(2, hostBits);
        }

        // Validate total hosts calculation
        if (isNaN(totalHosts) || totalHosts < 0 || !isFinite(totalHosts)) {
          throw new Error("Invalid total hosts calculation");
        }

        // Calculate usable hosts with edge case handling
        if (hostBits === 0) {
          // /32 subnet - single host route
          usableHosts = 1;
        } else if (hostBits === 1) {
          // /31 subnet - point-to-point link (RFC 3021)
          usableHosts = 2;
        } else {
          // Traditional subnetting - subtract network and broadcast addresses
          usableHosts = Math.max(0, totalHosts - 2);
        }

      } catch (hostError) {
        console.error("Host calculation error:", hostError);
        setError("Error calculating host addresses. The subnet may be too large.");
        return;
      }

      const firstHostInt = networkInt + 1;
      const lastHostInt = broadcastInt - 1;

      let cloudReserved = undefined;
      let firstUsableHost: string;

      try {
        firstUsableHost = intToIp(firstHostInt);
      } catch (hostConversionError) {
        console.error("Host IP conversion error:", hostConversionError);
        setError("Error converting host IP addresses.");
        return;
      }

      // Enhanced cloud provider handling with comprehensive error checking
      if (mode !== "normal") {
        const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
        if (provider) {
          try {
            // Validate that subnet is large enough for cloud provider requirements
            if (totalHosts < provider.reservedCount) {
              setError(`${provider.name} requires at least ${provider.reservedCount} IP addresses in the subnet (current: ${totalHosts})`);
              return;
            }

            usableHosts = Math.max(0, totalHosts - provider.reservedCount);

            // Enhanced validation for first usable offset
            const firstUsableOffset = networkInt + provider.firstUsableOffset;
            if (firstUsableOffset > broadcastInt || firstUsableOffset < networkInt) {
              setError(`${provider.name} subnet configuration error: insufficient IP addresses for required reservations`);
              return;
            }

            firstUsableHost = intToIp(firstUsableOffset);

            // Enhanced cloud reservation generation with error handling
            try {
              const reservations = provider.getReservations(networkInt, broadcastInt, intToIp);

              // Validate reservations
              if (!Array.isArray(reservations) || reservations.length === 0) {
                throw new Error("Invalid reservations generated");
              }

              // Validate each reservation
              reservations.forEach((reservation, index) => {
                if (!reservation.ip || !reservation.purpose || !reservation.description) {
                  throw new Error(`Invalid reservation at index ${index}`);
                }
              });

              cloudReserved = {
                provider: provider.name,
                reservations
              };
            } catch (reservationError) {
              console.error("Error generating cloud reservations:", reservationError);
              setError(`Error calculating ${provider.name} reserved IP addresses: ${reservationError instanceof Error ? reservationError.message : 'Unknown error'}`);
              return;
            }
          } catch (providerError) {
            console.error("Cloud provider calculation error:", providerError);
            setError(`Error processing ${provider.name} subnet requirements: ${providerError instanceof Error ? providerError.message : 'Unknown error'}`);
            return;
          }
        }
      }

      // Final comprehensive validation of all calculated values
      try {
        const networkAddress = intToIp(networkInt);
        const broadcastAddress = intToIp(broadcastInt);
        const subnetMaskAddress = intToIp(subnetMask);
        const wildcardMaskAddress = intToIp(wildcardMask);
        // Handle first and last host display for edge cases
        let firstHostDisplay: string;
        let lastHostDisplay: string;

        if (hostBits === 0) {
          // /32 subnet - single host route
          firstHostDisplay = networkAddress;
          lastHostDisplay = networkAddress;
        } else if (hostBits === 1) {
          // /31 subnet - point-to-point link (RFC 3021)
          firstHostDisplay = networkAddress;
          lastHostDisplay = intToIp(broadcastInt);
        } else {
          // Traditional subnetting
          firstHostDisplay = firstUsableHost;
          lastHostDisplay = intToIp(lastHostInt);
        }

        // Validate all IP conversions succeeded
        if (!networkAddress || !broadcastAddress || !subnetMaskAddress || !wildcardMaskAddress) {
          throw new Error("Failed to convert calculated addresses to IP format");
        }

        const calculatedSubnet = {
          network: networkAddress,
          broadcast: broadcastAddress,
          firstHost: firstHostDisplay,
          lastHost: lastHostDisplay,
          subnetMask: subnetMaskAddress,
          wildcardMask: wildcardMaskAddress,
          totalHosts: Math.floor(Math.min(totalHosts, Number.MAX_SAFE_INTEGER)), // Ensure safe integer
          usableHosts: Math.floor(Math.min(usableHosts, Number.MAX_SAFE_INTEGER)), // Ensure safe integer
          cidr: `/${cidr}`,
          cloudReserved
        };

        setSubnetInfo(calculatedSubnet);

      } catch (finalError) {
        console.error("Final validation error:", finalError);
        setError(`Error finalizing subnet calculation: ${finalError instanceof Error ? finalError.message : 'Unknown error'}`);
        setSubnetInfo(null);
        return;
      }

    } catch (error) {
      console.error("Unexpected subnet calculation error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`An unexpected error occurred during subnet calculation: ${errorMessage}. Please check your inputs and try again.`);
      setSubnetInfo(null);
    }
  }, [ipAddress, cidr, mode, ipVersion, validateCIDR, validateIP]);

  // Throttled calculation function to prevent excessive calculations
  const throttledCalculateSubnet = useCallback(
    () => {
      const throttledFn = throttle(() => {
        if (ipAddress && cidr && !isValidating) {
          const monitor = performanceMonitor.startOperation('subnet_calculation');
          monitor.addMetadata({ ipVersion, cloudMode: mode });

          try {
            calculateSubnet();
          } finally {
            monitor.end();
          }
        }
      }, 500);
      throttledFn();
    },
    [calculateSubnet, ipAddress, cidr, isValidating, ipVersion, mode]
  );

  // Use throttled calculation instead of immediate calculation
  useEffect(() => {
    if (ipAddress && cidr && !isValidating) {
      throttledCalculateSubnet();
    }
  }, [ipAddress, cidr, mode, ipVersion, throttledCalculateSubnet, isValidating]);

  // Handle input changes with debounced validation
  const handleIPAddressChange = useCallback((value: string) => {
    setIpAddress(value);
    debouncedValidateIP(value);
  }, [debouncedValidateIP]);

  const handleCIDRChange = useCallback((value: string) => {
    setCidr(value);
    debouncedValidateCIDR(value);
  }, [debouncedValidateCIDR]);

  // Reset subnet management when main calculation changes (Task 9.2)
  useEffect(() => {
    // Reset subnet management when IP address or CIDR changes
    resetSubnetManagement();
  }, [ipAddress, cidr, resetSubnetManagement]);

  // Recalculate split subnets when cloud provider mode changes (Task 9.2)
  useEffect(() => {
    // Only recalculate if we have existing split subnets and a valid parent subnet
    if (splitSubnets.length > 0 && subnetInfo && ipVersion === "ipv4") {
      setIsSubnetLoading(true);
      try {
        // Recalculate all split subnets with new cloud provider constraints
        setSplitSubnets(prevSubnets => {
          return prevSubnets.map(subnet => {
            // Recalculate usable hosts based on new cloud mode
            let usableHosts = subnet.totalHosts;
            let cloudReserved = undefined;

            if (mode !== "normal") {
              const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
              if (provider) {
                usableHosts = Math.max(0, subnet.totalHosts - provider.reservedCount);

                // Generate cloud reservations for this subnet
                const networkInt = ipToInt(subnet.network);
                const broadcastInt = ipToInt(subnet.broadcast);
                const reservations = provider.getReservations(networkInt, broadcastInt, intToIp);

                cloudReserved = reservations;
              }
            }

            return {
              ...subnet,
              usableHosts,
              cloudReserved
            };
          });
        });
        setSubnetError(null);
      } catch (error) {
        setSubnetError(error instanceof Error ? error.message : 'Failed to recalculate subnets for cloud provider mode');
      } finally {
        setIsSubnetLoading(false);
      }
    }
  }, [mode, subnetInfo, ipVersion, splitSubnets.length]);

  // Update subnet management visibility based on calculation state (Task 9.2)
  const shouldShowSubnetManagement = useMemo(() => {
    return subnetInfo !== null && ipVersion === "ipv4" && !error;
  }, [subnetInfo, ipVersion, error]);

  return (
    <div className="min-h-screen max-w-[80vw] max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Top navigation bar with logo and buttons */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          {mounted && (
            <Image
              src={theme === 'dark' ? '/aio_logo_dark.png' : '/aio_logo_light.png'}
              alt="Art of Infra Logo"
              width={120}
              height={40}
              className="h-10 w-auto"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            asChild
          >
            <a
              href="https://artofinfra.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit Art of Infra blog"
            >
              <Newspaper className="h-4 w-4" />
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            asChild
          >
            <a
              href="https://github.com/danjonesio/AoI-Subnet-Calculator"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>

      {/* Main header section */}
      <div className="text-center space-y-4 mb-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Professional Subnet Calculator</h1>
          <h2 className="text-xl font-semibold text-muted-foreground">
            Advanced IPv4/IPv6 Network Planning for Cloud Infrastructure
          </h2>
        </div>
        <div className="max-w-4xl mx-auto space-y-3">
          <p className="text-base text-muted-foreground">
            Calculate, split, and manage network subnets for <strong>AWS VPC</strong>, <strong>Azure VNet</strong>, and <strong>Google Cloud VPC</strong>.
            Automatically handles cloud provider IP reservations and supports advanced subnet operations.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              ✓ IPv4 & IPv6 Support
            </span>
            <span className="flex items-center gap-1">
              ✓ Cloud Provider Modes
            </span>
            <span className="flex items-center gap-1">
              ✓ Subnet Splitting & Joining
            </span>
            <span className="flex items-center gap-1">
              ✓ Export Configurations
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Created by <a href="https://artofinfra.com" className="text-primary hover:text-primary/80 hover:underline font-medium" target="_blank" rel="noopener noreferrer">Dan Jones</a> at <strong>Art of Infra</strong>
          </p>
        </div>
      </div>

      {/* Side by side layout for Network Input and Subnet Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Network Input Card - 1/3 width */}
        <Card className="rounded-lg shadow-md lg:col-span-1">
          <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3 lg:p-6 lg:pb-4">
            <CardTitle className="text-lg font-medium">Network Configuration</CardTitle>
            <CardDescription>
              {ipVersion === "ipv4"
                ? "Configure your IPv4 network parameters with CIDR notation. Select cloud provider mode for automatic IP reservation handling in AWS VPC, Azure VNet, or Google Cloud VPC environments."
                : "Configure your IPv6 network with prefix length notation. Cloud providers typically use standardized /64 prefixes for IPv6 subnets with automatic address allocation."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 lg:p-6 space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ipVersion">IP Version</Label>
                <Select value={ipVersion} onValueChange={(value: IPVersion) => {
                  setIpVersion(value);
                  // Update default values when switching IP versions
                  if (value === "ipv4") {
                    setIpAddress("192.168.1.0");
                    setCidr("24");
                  } else {
                    setIpAddress("2001:db8::1");
                    setCidr("64");
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select IP version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ipv4">IPv4</SelectItem>
                    <SelectItem value="ipv6">IPv6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip">IP Address</Label>
                <Input
                  id="ip"
                  type="text"
                  placeholder={ipVersion === "ipv4" ? "192.168.1.0" : "2001:db8::1"}
                  value={ipAddress}
                  onChange={(e) => handleIPAddressChange(e.target.value)}
                  className="w-full"
                />
                {isValidating && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Validating...
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cidr">CIDR Prefix</Label>
                <Input
                  id="cidr"
                  type="number"
                  min="0"
                  max={ipVersion === "ipv4" ?
                    (mode === "normal" ? "32" : CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS]?.maxCidr || "32") :
                    "128"
                  }
                  placeholder={ipVersion === "ipv4" ? "24" : "64"}
                  value={cidr}
                  onChange={(e) => handleCIDRChange(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode">Mode</Label>
                <Select value={mode} onValueChange={setMode} disabled={ipVersion === "ipv6"}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal Subnetting</SelectItem>
                    {ipVersion === "ipv4" && (
                      <>
                        <SelectItem value="aws">AWS VPC Mode</SelectItem>
                        <SelectItem value="azure">Azure VNet Mode</SelectItem>
                        <SelectItem value="gcp">Google Cloud VPC Mode</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {ipVersion === "ipv6" && (
                  <p className="text-xs text-muted-foreground">
                    Cloud providers use fixed /64 prefixes for IPv6 subnets
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}

            <Button onClick={calculateSubnet} className="w-full" size="lg">
              Calculate Subnet
            </Button>
          </CardContent>
        </Card>

        {/* Subnet Information Card - 2/3 width */}
        {subnetInfo && (
          <Card className="rounded-lg shadow-md lg:col-span-2">
            <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3 lg:p-6 lg:pb-4">
              <CardTitle className="text-lg font-medium">Calculated Network Details</CardTitle>
              <CardDescription>
                {(() => {
                  const cidrNum = parseInt(cidr);
                  let description = `Complete subnet analysis for ${ipAddress}/${cidr} including network addresses, host ranges, and subnet masks`;

                  if (ipVersion === "ipv4") {
                    if (cidrNum === 32) {
                      description += ". This is a host route targeting a single IP address";
                    } else if (cidrNum === 31) {
                      description += ". This is a point-to-point link configuration (RFC 3021)";
                    }

                    if (mode !== "normal") {
                      description += `. Cloud provider mode (${CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS]?.name}) automatically accounts for reserved IP addresses`;
                    }
                  } else if (ipVersion === "ipv6") {
                    description += ". IPv6 subnet with 128-bit address space and no broadcast addressing";
                  }

                  return description;
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Network Address</TableCell>
                    <TableCell>{subnetInfo.network}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Broadcast Address</TableCell>
                    <TableCell>{subnetInfo.broadcast}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">First Host</TableCell>
                    <TableCell>{subnetInfo.firstHost}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Last Host</TableCell>
                    <TableCell>{subnetInfo.lastHost}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Subnet Mask</TableCell>
                    <TableCell>{subnetInfo.subnetMask}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Wildcard Mask</TableCell>
                    <TableCell>{subnetInfo.wildcardMask}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      {ipVersion === "ipv6" ? "Total Addresses" : "Total Hosts"}
                    </TableCell>
                    <TableCell>
                      {subnetInfo.ipv6Info ?
                        subnetInfo.ipv6Info.totalAddressesFormatted :
                        subnetInfo.totalHosts.toLocaleString()
                      }
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      {ipVersion === "ipv6" ? "Usable Addresses" : "Usable Hosts"}
                    </TableCell>
                    <TableCell>
                      {subnetInfo.ipv6Info ?
                        subnetInfo.ipv6Info.usableAddressesFormatted :
                        subnetInfo.usableHosts.toLocaleString()
                      }
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">CIDR Notation</TableCell>
                    <TableCell>{subnetInfo.network}{subnetInfo.cidr}</TableCell>
                  </TableRow>
                  {subnetInfo.ipv6Info && (
                    <>
                      <TableRow>
                        <TableCell className="font-medium">Address Type</TableCell>
                        <TableCell>{subnetInfo.ipv6Info.addressType}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Host Bits</TableCell>
                        <TableCell>{subnetInfo.ipv6Info.hostBits} bits</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Full-width sections below */}
      {subnetInfo && (
        <div className="space-y-4 sm:space-y-6">
          {subnetInfo.cloudReserved && (
            <Card className="rounded-lg shadow-md">
              <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3 lg:p-6 lg:pb-4">
                <CardTitle className="text-lg font-medium">{subnetInfo.cloudReserved.provider} Reserved IP Addresses</CardTitle>
                <CardDescription>
                  {subnetInfo.cloudReserved.provider} automatically reserves these IP addresses in every subnet
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 lg:p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subnetInfo.cloudReserved.reservations.map((reservation, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono">{reservation.ip}</TableCell>
                        <TableCell className="font-medium">{reservation.purpose}</TableCell>
                        <TableCell>{reservation.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Advanced Subnet Management Section - Updated for Task 9.2 */}
          {shouldShowSubnetManagement && (
            <Card className="rounded-lg shadow-md">
              <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3 lg:p-6 lg:pb-4">
                <CardTitle className="text-lg font-medium flex items-center justify-between">
                  <span>Subnet Management & Export</span>
                  {splitSubnets.length > 0 && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-normal text-muted-foreground">
                        {splitSubnets.length} subnet{splitSubnets.length !== 1 ? 's' : ''}
                      </span>
                      {selectedSubnets.size > 0 && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {selectedSubnets.size} selected
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetSubnetManagement}
                        disabled={isSubnetLoading}
                        className="h-10 sm:h-8"
                      >
                        Reset All
                      </Button>
                    </div>
                  )}
                </CardTitle>
                <CardDescription>
                  Split networks into smaller subnets, join adjacent subnets, and export configurations. 
                  View your subnets in list or tree format, select the ones you need, and export them in various formats for documentation or infrastructure as code.
                  {mode !== "normal" && ` Cloud provider IP reservations for ${mode.toUpperCase()} are automatically calculated and applied.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                <SubnetErrorBoundary
                  context="subnet-management"
                  onReset={resetSubnetManagement}
                >
                  {/* Error Display */}
                  {subnetError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {subnetError}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Loading State */}
                  {isSubnetLoading && (
                    <Alert>
                      <LoadingSpinner size="sm" message="Processing subnet operation..." />
                      <AlertDescription className="ml-6">
                        Please wait while we calculate your subnet configuration...
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Subnet Splitting Section */}
                  <div className="space-y-4">
                    {isSubnetLoading ? (
                      <SubnetSplitterSkeleton />
                    ) : (
                      <SubnetSplitter
                        parentSubnet={{
                          ...subnetInfo,
                          id: subnetInfo.network + subnetInfo.cidr,
                          level: 0
                        }}
                        ipVersion={ipVersion}
                        cloudMode={mode as CloudMode}
                        onSplit={addSplitSubnets}
                        onError={(error: SubnetError) => setSubnetError(error.message)}
                        disabled={isSubnetLoading}
                        maxSubnets={1000}
                      />
                    )}
                  </div>

                  {/* Subnet Management Controls - Only show when subnets exist */}
                  {splitSubnets.length > 0 && (
                    <>
                      {/* Subnet Joining Section */}
                      <div className="space-y-4">
                        {isSubnetLoading ? (
                          <SubnetJoinerSkeleton />
                        ) : (
                          <SubnetJoiner
                            availableSubnets={splitSubnets}
                            selectedSubnets={selectedSubnets}
                            ipVersion={ipVersion}
                            onSelectionChange={setSelectedSubnets}
                            onJoin={(joinedSubnet, operation) => {
                              // Remove the joined subnets from the list
                              const subnetIdsToRemove = operation.sourceSubnets;
                              removeSubnets(subnetIdsToRemove, operation);

                              // Add the new joined subnet
                              addSplitSubnets([joinedSubnet], {
                                ...operation,
                                type: 'join',
                                resultSubnets: [joinedSubnet]
                              });
                            }}
                            onError={(error: SubnetError) => setSubnetError(error.message)}
                            disabled={isSubnetLoading}
                          />
                        )}
                      </div>

                      {/* View Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">View:</span>
                          <div className="flex rounded-md border">
                            <Button
                              variant={currentView === 'list' ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => setCurrentView('list')}
                              className="rounded-r-none h-10 sm:h-8"
                            >
                              List
                            </Button>
                            <Button
                              variant={currentView === 'tree' ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => setCurrentView('tree')}
                              className="rounded-l-none h-10 sm:h-8"
                            >
                              Tree
                            </Button>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-2">
                          {selectedSubnets.size > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={clearSubnetSelection}
                              className="h-10 sm:h-8"
                            >
                              Clear Selection
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={selectAllSubnets}
                            className="h-10 sm:h-8"
                          >
                            Select All
                          </Button>
                        </div>
                      </div>

                      {/* Unified Subnet Display and Export - Side by Side Layout */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                        {/* Subnet List/Tree View - Takes up 2/3 of the width */}
                        <div className="lg:col-span-2">
                          {currentView === 'list' ? (
                            isSubnetLoading ? (
                              <SubnetListSkeleton />
                            ) : (
                              <SubnetList
                                subnets={splitSubnets}
                                selectedSubnets={selectedSubnets}
                                onSelectionChange={setSelectedSubnets}
                                onSort={updateSubnetSort}
                                onFilter={updateSubnetFilter}
                                onCopySubnet={async (subnet) => {
                                  try {
                                    const subnetInfo = `Network: ${subnet.network}/${subnet.cidr}
Broadcast: ${subnet.broadcast}
First Host: ${subnet.firstHost}
Last Host: ${subnet.lastHost}
Total Hosts: ${subnet.totalHosts.toLocaleString()}
Usable Hosts: ${subnet.usableHosts.toLocaleString()}`;

                                    await navigator.clipboard.writeText(subnetInfo);
                                    // Success feedback could be added here
                                  } catch (error) {
                                    console.error('Failed to copy subnet information:', error);
                                    setSubnetError('Failed to copy subnet information to clipboard');
                                  }
                                }}
                                sortBy={sortBy}
                                sortOrder={sortOrder}
                                filterText={filterText}
                                loading={isSubnetLoading}
                                showSelection={true}
                                showActions={true}
                              />
                            )
                          ) : (
                            isSubnetLoading ? (
                              <SubnetListSkeleton />
                            ) : (
                              <SubnetTree
                                subnets={splitSubnets}
                                selectedSubnets={selectedSubnets}
                                onSelectionChange={setSelectedSubnets}
                                onCopySubnet={async (subnet) => {
                                  try {
                                    const subnetInfo = `Network: ${subnet.network}/${subnet.cidr}
Broadcast: ${subnet.broadcast}
First Host: ${subnet.firstHost}
Last Host: ${subnet.lastHost}
Total Hosts: ${subnet.totalHosts.toLocaleString()}
Usable Hosts: ${subnet.usableHosts.toLocaleString()}`;

                                    await navigator.clipboard.writeText(subnetInfo);
                                    // Success feedback could be added here
                                  } catch (error) {
                                    console.error('Failed to copy subnet information:', error);
                                    setSubnetError('Failed to copy subnet information to clipboard');
                                  }
                                }}
                                expandedNodes={expandedNodes}
                                onExpandChange={setExpandedNodes}
                                showRelationships={true}
                                filterText={filterText}
                                onFilter={updateSubnetFilter}
                                loading={isSubnetLoading}
                                showSelection={true}
                                showActions={true}
                              />
                            )
                          )}
                        </div>

                        {/* Export Panel - Takes up 1/3 of the width */}
                        <div className="lg:col-span-1">
                          <div className="sticky top-6">
                            <SubnetExport
                              subnets={splitSubnets}
                              selectedSubnets={selectedSubnets}
                              onExport={(result) => {
                                // Optional: Add success feedback or logging
                                console.log('Export completed:', result.filename, result.size, 'bytes');
                              }}
                              onError={(error) => {
                                setSubnetError(error.message);
                              }}
                              availableFormats={['text', 'csv', 'json']}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </SubnetErrorBoundary>
              </CardContent>
            </Card>
          )}

          {/* IPv6 Notice */}
          {subnetInfo && ipVersion === "ipv6" && (
            <Card className="rounded-lg shadow-md">
              <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3 lg:p-6 lg:pb-4">
                <CardTitle className="text-lg font-medium">Advanced Subnet Management</CardTitle>
                <CardDescription>
                  IPv6 subnet management features are coming soon.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 lg:p-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Advanced subnet splitting and joining features are currently available for IPv4 networks only.
                    IPv6 support will be added in a future update.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-border text-center space-y-2">
        <div className="text-sm text-muted-foreground">
          <a 
            href="https://artofinfra.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 hover:underline font-medium"
          >
            Art of Infra
          </a>
          {' - Subnet Calculator by Dan Jones - 2025'}
        </div>
        <div className="text-xs text-muted-foreground italic">
          No network engineers were harmed during the making of this
        </div>
      </footer>
    </div>
  );
}