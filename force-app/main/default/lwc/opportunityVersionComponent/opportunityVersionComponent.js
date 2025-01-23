import { LightningElement, api, wire, track } from 'lwc';

import { subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import OpportunityVersionRefreshChannel from '@salesforce/messageChannel/OpportunityVersionRefreshChannel__c';
import OpportunityVersionLineItemRefreshChannel from '@salesforce/messageChannel/OpportunityVersionLineItemRefreshChannel__c';

import getRelatedOpportunityVersions from '@salesforce/apex/OpportunityVersionComponentController.getRelatedOpportunityVersions';
import getOpportunityVersionLineItems from '@salesforce/apex/OpportunityVersionComponentController.getOpportunityVersionLineItems';

export default class OpportunityVersionComponent extends LightningElement {

    @api recordId;
    @track versions = [];
    @track versionLineItems = [];
    @track selectedVersionId = '';
    @track isVersionLoading = false;
    @track isVersionLineItemsLoading = false;
    @track selectedRows = [];

    versionColumns = [
        { label: 'Name', fieldName: 'Name', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Status', fieldName: 'Status__c', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Total Price', fieldName: 'Total_Price__c', type: 'currency', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Total Hours', fieldName: 'Total_Hours__c', type: 'number', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Total Cost', fieldName: 'Total_Cost__c', type: 'currency', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Syncing', fieldName: 'Syncing__c', type: 'boolean', 
            cellAttributes: { alignment: 'left' } },
    ];

    versionLineItemColumns = [
        { label: 'Product Name', fieldName: 'Team_Name__c', type: 'text', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Price', fieldName: 'Price__c', type: 'currency', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Hours', fieldName: 'Hours__c', type: 'number', 
            cellAttributes: { alignment: 'left' } },
        { label: 'Cost', fieldName: 'Cost__c', type: 'currency', 
            cellAttributes: { alignment: 'left' } },
    ];

    @wire(MessageContext) messageContext;

    connectedCallback() {
        console.log('Initializing Version Component');
        this.fetchRelatedVersions();

        // Subscribe to the Version refresh channel
        this.subscription = subscribe(this.messageContext, OpportunityVersionRefreshChannel, (message) => {
            if (message.refresh) {
                console.log('Received Version Refresh event');
                this.fetchRelatedVersions();
            }
        });

        // Subscribe to the Version Line Item refresh channel
        this.lineItemSubscription = subscribe(this.messageContext, OpportunityVersionLineItemRefreshChannel, (message) => {
            if (message.refresh) {
                console.log('Received Version Line Item Refresh event');
                this.fetchVersionLineItems();
            }
        });
    }

    disconnectedCallback() {
        console.log('Disconnecting subscriptions');
        if (this.subscription) {
            unsubscribe(this.subscription);
            this.subscription = null;
        }

        if (this.lineItemSubscription) {
            unsubscribe(this.lineItemSubscription);
            this.lineItemSubscription = null;
        }
    }

    fetchRelatedVersions() {
        console.log('Fetching related versions for Opportunity ID:', this.recordId);
        this.isVersionLoading = true;

        getRelatedOpportunityVersions({ opportunityId: this.recordId })
            .then((result) => {
                this.versions = result;
                console.log('Fetched related versions:', this.versions);

                const syncingVersion = this.versions.find((version) => version.Syncing__c);
                if (syncingVersion) {
                    this.selectedVersionId = syncingVersion.Id;
                    this.selectedRows = [this.selectedVersionId];
                    console.log('Found syncing version:', syncingVersion);
                    this.fetchVersionLineItems();
                }
            })
            .catch((error) => {
                console.error('Error fetching versions:', error);
            })
            .finally(() => {
                this.isVersionLoading = false;
                console.log('Completed fetching related versions');
            });
    }

    fetchVersionLineItems() {
        if (!this.selectedVersionId) {
            console.warn('No selectedVersionId to fetch line items.');
            return;
        }
        console.log('Fetching version line items for Version ID:', this.selectedVersionId);
        this.versionLineItems = []; // Clear existing data for UI refresh
        this.isVersionLineItemsLoading = true;

        getOpportunityVersionLineItems({ versionId: this.selectedVersionId })
            .then((result) => {
                console.log('Fetched version line items:', result);
                const tempVersionId = this.selectedVersionId;
                this.selectedVersionId = null;
                setTimeout(() => {
                    this.selectedVersionId = tempVersionId;
                    this.versionLineItems = [...result];
                    console.log('Updated version line items in UI:', this.versionLineItems);
                }, 0);
            })
            .catch((error) => {
                console.error('Error fetching version line items:', error);
            })
            .finally(() => {
                this.isVersionLineItemsLoading = false;
                console.log('Completed fetching version line items');
            });
    }

    handleVersionRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            this.selectedVersionId = selectedRows[0].Id;
            this.selectedRows = [this.selectedVersionId];
            console.log('Selected Version ID:', this.selectedVersionId);
            this.fetchVersionLineItems();
        }
    }

    refreshComponent() {
        console.log('Refreshing Version Component');
        this.fetchRelatedVersions();
    }
}