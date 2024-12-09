import urllib.parse
from pinecone import Pinecone
from llama_index.core import VectorStoreIndex
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.vector_stores.pinecone import PineconeVectorStore
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.core.base.llms.types import ChatMessage, MessageRole
from llama_index.core.chat_engine import ContextChatEngine
from llama_index.core.memory import ChatMemoryBuffer
from dotenv import load_dotenv
from llama_index.core.postprocessor.types import BaseNodePostprocessor
from llama_index.core.schema import NodeWithScore, QueryBundle
from llama_index.core.vector_stores.types import MetadataFilters, MetadataFilter, FilterOperator
from typing import List
from typing import Optional
from extract_query_details import extract_query_details
from post_processors.filter import filter_nodes
from post_processors.re_rank_nodes import re_rank_nodes
from post_processors.clean_content import clean_contents
import json

load_dotenv()

pinecone = Pinecone()
pinecone_index_name = "nasdaq-companies"

pinecone_index = pinecone.Index(pinecone_index_name)

vector_store = PineconeVectorStore(pinecone_index=pinecone_index)

# Instantiate VectorStoreIndex object from your vector_store object
vector_index = VectorStoreIndex.from_vector_store(
    vector_store=vector_store, embed_model=OpenAIEmbedding(model="text-embedding-3-small"))


def handle_chat(query):
  try:
    filters =extract_query_details(query)
    
    print(json.dumps(filters))

    retriever = VectorIndexRetriever(
        index=vector_index,
        similarity_top_k=20,
        filters=MetadataFilters(
            filters=[
                MetadataFilter(
                    key="symbol",
                    operator=FilterOperator.IN,
                    value=[company["symbol"] for company in filters["companies"]
                           ]),
            ]
        )
    )
    nodes = retriever.retrieve(query)
    
    for node in nodes:
      print(node.node.node_id)
      
    print()
    
    result_nodes = []
    for index, node in enumerate(nodes):      
        
      result_nodes.append({
        "content": node.get_content(),
        "node_id":node.node.node_id,
        "source":node.node.metadata["url"],
        "filed":node.node.metadata["filed"] if "filed" in node.node.metadata.keys() else None,
        "title":node.node.metadata["title"] if "title" in node.node.metadata.keys() else None,
        "doc_type":"SEC Filing" if "form_type" in node.node.metadata.keys() else 
        "IR Page" if "section_name" in node.node.metadata.keys() else "Earnings Call"
      })
      
    print("Filtering")
    filtered_nodes = filter_nodes(filters["companies"][0]["company_name"],query,result_nodes)
    
    for index,node in enumerate(filtered_nodes):
      print(node["node_id"])
      # node["content"] = result_nodes[index]["content"]
      
    print()
      
    print("Re-Ranking")
    re_ranked_nodes= re_rank_nodes(filters["companies"][0]["company_name"],query,filtered_nodes)
    
    for index,node in enumerate(re_ranked_nodes):
      print(node["node_id"])
      # node["content"] = result_nodes[index]["content"]
    
    print()
      
    print("Cleaning")
    cleaned_nodes = clean_contents(query,re_ranked_nodes)
    
    for index,node in enumerate(cleaned_nodes):
      print(node["node_id"])
      # node["content"] = result_nodes[index]["content"]
    
    print()
    
    final_nodes = []
    
    valid_sources = []
    invalid_sources = []
    
    for node in re_ranked_nodes:
      for item in result_nodes:
        if item["node_id"] == node["node_id"]:
          node["content"] = item["content"]
          node["source"] = item["source"]
          node["doc_type"] = item["doc_type"]
          break
      
      for item in cleaned_nodes:
        if item["node_id"] == node["node_id"]:
          node["cleaned_content"] = item["cleaned_content"]
          node["highlight"] = item["highlight"]
          break
        
      if not "cleaned_content" in node.keys() or not "source" in node.keys():
        continue
      
      if any(final_node["node_id"] == node["node_id"] for final_node in final_nodes):
        continue
      
      final_nodes.append({
        "node_id":node["node_id"],
        "content": node["cleaned_content"],
        "source":node["source"]+"#:~:text="+item["highlight"],
        "doc_type":node["doc_type"]
      })
      
    for node in final_nodes:
      if not node["source"] in [source["url"] for source in valid_sources]:
        valid_sources.append({
          "doc_type":node["doc_type"],
          "url":node["source"]
        })
      
    for node in result_nodes:
      if not node["source"] in [source["url"] for source in valid_sources] and not node["source"] in [source["url"] for source in invalid_sources]:
        invalid_sources.append({
                                "doc_type":node["doc_type"],
                                "url":node["source"]
                               })
      
    # final_nodes = {
    #   "original":result_nodes,
    #   "filtered":filtered_nodes,
    #   "re_ranked":re_ranked_nodes,
    #   "cleaned":cleaned_nodes,
    #   "final":final_nodes
    # }   
      
    return final_nodes,valid_sources,invalid_sources
  except Exception as e:
    print("error",e)
    return [],[],[]
      

# Grab 5 search results
retriever = VectorIndexRetriever(
    index=vector_index, similarity_top_k=5)

memory = ChatMemoryBuffer.from_defaults(token_limit=1500)

class CustomNodePostprocessor(BaseNodePostprocessor):
    def _postprocess_nodes(
        self, nodes: List[NodeWithScore], query_bundle: Optional[QueryBundle] = None
    ) -> List[NodeWithScore]:
        print(query_bundle.query_str)

        filters = extract_query_details(query_bundle.query_str)
        
        print(json.dumps(filters))
        
        filtered_nodes = []
        
        for node in nodes:
          if node.node.metadata["company_name"] in [company["company_name"] for company in filters["companies"]]:
            if filters["query_type"] == "SEC_FILINGS" and "filed" in  node.node.metadata.keys():
              filtered_nodes.append(node)
              
            elif filters["query_type"] == "IR" and "section_name" in node.node.metadata.keys():
              filtered_nodes.append(node)
              
            elif filters["query_type"] == "OTHERS":
              filtered_nodes.append(node)

        return filtered_nodes


custom_postprocessor =  CustomNodePostprocessor()

chat_engine = ContextChatEngine(retriever=retriever,
                                memory=memory,
                                node_postprocessors=[custom_postprocessor],
                                prefix_messages=[],
                                llm=OpenAI(
                                    model="gpt-4o-mini", system_prompt="""

You are a specialized Financial AI Assistant focusing exclusively on Nasdaq-listed companies' investor relations (IR) and SEC Filings data. Your primary objectives are:

1. Context and Scope Constraints:
   - ONLY respond to queries directly related to Nasdaq-listed companies
   - Interpret company name variations contextually (e.g., "apple" = Apple Inc., not the fruit)
   - Reject any queries unrelated to financial, investment, or corporate information
   - dont use extrenal knowledge

2. Query Processing Rules:
   - For specific company queries:
     * Provide comprehensive investor relations and sec filings pages
     * Include key financial metrics, recent financial reports, stock performance, latest sec filings.
     * Offer insights from latest quarterly, annual reports and sec filings reports
     * Respond only if directly connected to Nasdaq-listed companies
     * Provide data-driven, analytical insights
     * Maintain professional, concise communication style

   - For sec filings queries:
    * Provide the detailed explaination of the contents of the sec filings
    * Read the entire sec filing data provided and provide the detailed explaination of the contents of the sec filings
    * Instead of Redirecting the user to the actual source explain the content of that source as you already have access to those data
    * Also if the data is only in pdf format then dont provide the pdf link, just mention that the data is not available

    - For shareholders queries:
    * Provide the detailed explaination of the shareholders data if available
    * Provide the data in tabular format if available
    * If the data is not available, then instead of providing SEC filing reference, just mention that the data is not available

3. Strict Rejection Criteria:
   - Immediately reject queries about:
     * Non-financial topics
     * Personal financial advice
     * Speculative or non-verifiable information
     * Queries not related to Nasdaq-listed corporate entities


4. Context and Scope Constraints:
- Respond **only** to queries directly related to Nasdaq-listed companies.
- Automatically interpret partial or colloquial mentions of company names as their corresponding Nasdaq-listed corporate entities:
  - Examples:
    - "apple" = **Apple Inc. (AAPL)**
    - "microsoft" = **Microsoft Corporation (MSFT)**
    - "google" = **Alphabet Inc. (GOOGL)**
- Immediately reject any query unrelated to financial, investment, or corporate topics concerning Nasdaq-listed companies.


  For General Financial Queries:
- Only respond if the query pertains to Nasdaq-listed companies.
- Offer data-driven insights and objective analysis with clear, concise language.


8. Strict Rejection Criteria:
Reject queries outright if they:
- Are about non-financial topics or personal advice.
- Are speculative, unverifiable, or unrelated to Nasdaq-listed companies.

9. Company Name Interpretation:
- Automatically map abbreviated or partial mentions to their corresponding Nasdaq-listed companies:
  - Example: "tesla" = **Tesla Inc. (TSLA)**, "meta" = **Meta Platforms Inc. (META)**.
- Assume all company names refer to Nasdaq-listed entities unless explicitly stated otherwise.


### Operational Principle:
If a query is unclear or outside the scope of Nasdaq-listed companies’ financial information, respond professionally with a declination and guide the user to refine their query.


    """, temperature=0.5))

def handle_chat_v1(query):
    answer = chat_engine.chat(message=query,
                              chat_history=[
                                  ChatMessage(
                                      role=MessageRole.USER,
                                      content="apple"
                                  ),
                                  ChatMessage(
                                      role=MessageRole.ASSISTANT,
                                      content="""
        Apple Inc. has recently provided key updates, financial reports, and announcements relevant to investors and the public:

        1. **Fourth Quarter Financial Results (FY 24):**  
           - earnings call for the period , provided key insights into the company's financial performance and strategic direction. 
           - **Quarterly Revenue:** $94.9 billion, a **6% increase** year over year.  
           - **Diluted Earnings Per Share (EPS):** $0.97; adjusted EPS (excluding a one-time charge) was $1.64, reflecting a **12% increase** year over year.  
           - **Operating Cash Flow:** Nearly $27 billion generated during the quarter.  
           - **Shareholder Returns:** Over $29 billion returned to shareholders.  
           - **Dividend Declaration:** A cash dividend of $0.25 per share was declared, payable on November 14, 2024, to shareholders of record as of November 11, 2024.  
           - **Drivers:** Tim Cook noted record revenue driven by strong demand for the new iPhone 16 lineup and other products, while CFO Luca Maestri emphasized robust operating performance and customer loyalty.  
           - For more details, view the [press release](https://www.apple.com/newsroom/2024/10/apple-reports-fourth-quarter-results/).  

        2. **Recent SEC Filings:**  
           - **Form 8-K (October 31, 2024):**
             - Includes the quarterly financial results press release and important updates for investors.  
             - Access the filing [here](https://app.quotemedia.com/data/downloadFiling?webmasterId=90423&ref=318679785&type=HTML&symbol=AAPL&cdn=f7eff34fbbd60ad782cbe98de2cc3d9e&companyName=Apple+Inc.&formType=8-K&formDescription=Current+report+pursuant+to+Section+13+or+15%28d%29&dateFiled=2024-10-31).  
           - **Form 10-K (November 1, 2024):**  
             - Apple’s annual report for the fiscal year ended September 28, 2024, offering comprehensive details about financial condition, business operations, and risk factors.  
             - Access the filing [here](https://app.quotemedia.com/data/downloadFiling?webmasterId=90423&ref=318680792&type=HTML&symbol=AAPL&cdn=a6ac3148f61462e1b7d60719ee317ef9&companyName=Apple+Inc.&formType=10-K&formDescription=Annual+report+pursuant+to+Section+13+or+15%28d%29&dateFiled=2024-11-01).  

        3. **Investor Relations Resources:**  
           - Investors can stay updated through Apple’s Investor Relations website, which provides financial reports, press releases, and corporate governance details: [Apple Investor Relations](https://investor.apple.com/investor-relations/default.aspx).  

        These updates and reports highlight Apple's financial health, performance metrics, and ongoing efforts to maintain shareholder value.
        """),

                              ]
                              )

    sources = []
    for source in answer.source_nodes:
        sources.append({
            "score": source.score,
            "url": source.node.extra_info["url"]
        })

    sources = sorted(sources, key=lambda x: x['score'], reverse=True)

    return answer.response, sources
